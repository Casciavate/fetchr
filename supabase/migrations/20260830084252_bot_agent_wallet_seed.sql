-- User-approved: Simon (bot-shipper) needs a wallet balance to pay escrow
-- on bot-driven deals. He has no Stripe Connect account, so this can
-- never be withdrawn as real money. Same shape as a real top-up
-- transaction row.
update public.profiles set wallet_balance = 3000 where email = 'sandrocasciani1+fetchrshipper@gmail.com';
insert into public.transactions (user_id, type, amount, description, status)
select id, 'topup', 3000, 'Test-fixture funding for bot-agent escrow payments', 'completed'
from public.profiles where email = 'sandrocasciani1+fetchrshipper@gmail.com';
