-- Pickup pass recovery schema (sanitized showcase subset).
--
-- Adds a dedicated token table so a customer can hold more than one
-- recoverable token per order (the original checkout token, plus any
-- re-issued "recovery" token from a lost-pass request) without overloading
-- a single column on pickup_orders. token_ciphertext enables recovery email
-- re-sends without ever storing the raw token in plaintext. See
-- docs/token-lifecycle.md.

create table if not exists public.pickup_pass_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pickup_orders(id) on delete cascade,
  token_hash text not null,
  token_last4 text not null check (char_length(token_last4) = 4),
  -- AES-256-GCM ciphertext (nullable): only present when
  -- PICKUP_TOKEN_ENCRYPTION_SECRET is configured, so recovery/re-send is an
  -- opt-in capability rather than a hard requirement.
  token_ciphertext text,
  token_source text not null check (token_source in ('checkout', 'recovery')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists idx_pickup_pass_tokens_token_hash_unique
  on public.pickup_pass_tokens (token_hash);

create index if not exists idx_pickup_pass_tokens_order_id
  on public.pickup_pass_tokens (order_id);

-- At most one outstanding "recovery" token per order — re-requesting a lost
-- pass reuses the existing recovery token instead of minting a new one each
-- time, which keeps the redeemable-token set small and auditable.
create unique index if not exists idx_pickup_pass_tokens_recovery_order_unique
  on public.pickup_pass_tokens (order_id)
  where token_source = 'recovery';

alter table public.pickup_pass_tokens enable row level security;

-- Redemption now checks the token table (supports multiple valid tokens per
-- order) instead of the single redeem_token_hash column on pickup_orders.
create or replace function public.redeem_pickup_order(
  p_order_id uuid,
  p_actor_profile_id uuid,
  p_expected_token_hash text default null,
  p_manual_override boolean default false
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_order public.pickup_orders%rowtype;
  v_updated_at timestamptz := timezone('utc'::text, now());
begin
  select *
  into v_order
  from public.pickup_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pickup order not found for redemption.';
  end if;

  if v_order.order_status = 'canceled' then
    raise exception 'Canceled pickup orders cannot be redeemed.';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Only paid pickup orders can be redeemed.';
  end if;

  if v_order.redeem_token_issued_at is null then
    raise exception 'This pickup order does not have an issued QR token yet.';
  end if;

  if v_order.redeem_invalidated_at is not null then
    raise exception 'This pickup QR is invalidated and can no longer be redeemed.';
  end if;

  if v_order.redeemed_at is not null then
    raise exception 'This pickup order has already been redeemed.';
  end if;

  if (
    not p_manual_override
    and not exists (
      select 1
      from public.pickup_pass_tokens
      where order_id = p_order_id
        and token_hash = coalesce(p_expected_token_hash, '')
    )
  ) then
    raise exception 'The scanned pickup QR token is invalid.';
  end if;

  update public.pickup_orders
  set redeemed_at = v_updated_at,
      redeemed_by_profile_id = p_actor_profile_id,
      fulfillment_status = 'delivered',
      updated_at = v_updated_at
  where id = p_order_id;

  insert into public.pickup_redemption_events (order_id, event_type, actor_profile_id, details, created_at)
  values (
    p_order_id,
    'redeemed',
    p_actor_profile_id,
    jsonb_build_object('manual_override', p_manual_override),
    v_updated_at
  );
end;
$$;
