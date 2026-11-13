# Razorpay setup

Copy `.env.example` to `.env` and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to a matching pair from the same Razorpay mode (both test or both live). Keep `.env` private; it is git-ignored. The deployment scripts preserve this file and Docker Compose loads the credentials from it. Restart the backend after changing credentials.

The key ID `rzp_test_S7dlJIqMvrpcajongR1rNVsrzSoVyjGx6VY9Zm` is test mode. To use it, set it as `RAZORPAY_KEY_ID` in the server's private `backend/.env` and also set the matching test `RAZORPAY_KEY_SECRET` from the Razorpay Dashboard. A key ID alone cannot authenticate payment requests. Do not pair a test key ID with a live secret.

The customer portal creates Razorpay orders on the backend and credits a wallet only after the backend verifies the checkout signature and confirms the payment is captured for the expected amount and customer.
