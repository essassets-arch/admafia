# Razorpay setup

Copy `.env.example` to `.env` and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to the rotated live credentials from the AdMafia Razorpay account. Keep `.env` private; it is git-ignored. Restart the backend after changing credentials.

The customer portal creates Razorpay orders on the backend and credits a wallet only after the backend verifies the checkout signature and confirms the payment is captured for the expected amount and customer.
