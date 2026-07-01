-- Pickup pass redemption schema (sanitized showcase subset).
--
-- This is a standalone schema representing only the pickup-pass concepts:
-- a paid pickup order, its line items, and an append-only redemption audit
-- log. The production schema also links orders to a broader catalog,
-- inventory, and cycle system that is out of scope for this showcase.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pickup_sale_unit') then
    create type public.pickup_sale_unit as enum ('unit', 'weight');
  end if;

  if not exists (select 1 from pg_type where typname = 'pickup_order_status') then
    create type public.pickup_order_status as enum ('confirmed', 'canceled');
  end if;

  if not exists (select 1 from pg_type where typname = 'pickup_payment_status') then
    create type public.pickup_payment_status as enum ('unpaid', 'paid', 'refunded');
  end if;

  if not exists (select 1 from pg_type where typname = 'pickup_fulfillment_status') then
    create type public.pickup_fulfillment_status as enum ('pending', 'delivered');
  end if;

  if not exists (select 1 from pg_type where typname = 'pickup_redemption_event_type') then
    create type public.pickup_redemption_event_type as enum ('qr_issued', 'qr_invalidated', 'redeemed');
  end if;
end
$$;

create table if not exists public.pickup_orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text not null,
  customer_email_normalized text not null,
  customer_phone text,
  market_name text not null,
  pickup_date date not null,
  pickup_window_label text not null,
  pickup_location text not null,
  order_status public.pickup_order_status not null default 'confirmed',
  payment_status public.pickup_payment_status not null default 'unpaid',
  fulfillment_status public.pickup_fulfillment_status not null default 'pending',
  total_amount numeric(10, 2) not null default 0 check (total_amount >= 0),
  currency_code text not null default 'USD' check (char_length(currency_code) = 3),
  -- Opaque redemption token hash. The raw token is never stored here — see
  -- docs/token-lifecycle.md and 002_pickup_pass_recovery.sql for the
  -- lookup/recovery table that supersedes this column for hash lookups.
  redeem_token_hash text,
  redeem_token_last4 text check (redeem_token_last4 is null or char_length(redeem_token_last4) = 4),
  redeem_token_issued_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by_profile_id uuid,
  redeem_invalidated_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_pickup_orders_customer_email_normalized
  on public.pickup_orders (customer_email_normalized);

create index if not exists idx_pickup_orders_pickup_date
  on public.pickup_orders (pickup_date);

create unique index if not exists idx_pickup_orders_redeem_token_hash_unique
  on public.pickup_orders (redeem_token_hash)
  where redeem_token_hash is not null;

create table if not exists public.pickup_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pickup_orders(id) on delete cascade,
  product_name text not null,
  quantity numeric(10, 2) not null check (quantity > 0),
  sale_unit public.pickup_sale_unit not null,
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  currency_code text not null check (char_length(currency_code) = 3),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_pickup_order_items_order_id
  on public.pickup_order_items (order_id);

-- Append-only audit trail. Every redemption-relevant state change is
-- recorded here rather than only reflected in pickup_orders columns, so the
-- history of a pass (issued, invalidated, redeemed) survives independently
-- of the current row state.
create table if not exists public.pickup_redemption_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pickup_orders(id) on delete cascade,
  event_type public.pickup_redemption_event_type not null,
  actor_profile_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_pickup_redemption_events_order_id
  on public.pickup_redemption_events (order_id, created_at desc);

alter table public.pickup_orders enable row level security;
alter table public.pickup_order_items enable row level security;
alter table public.pickup_redemption_events enable row level security;

-- Reads/writes go through a service-role backend in this showcase (no
-- end-user RLS policies are defined). Production scopes staff/operator
-- access with role-based policies layered on top of this baseline.

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

  if not p_manual_override and coalesce(p_expected_token_hash, '') <> coalesce(v_order.redeem_token_hash, '') then
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
