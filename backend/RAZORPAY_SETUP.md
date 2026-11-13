# Razorpay setup

Copy `.env.example` to `.env` and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to a matching pair from the same Razorpay mode (both test or both live). Keep `.env` private; it is git-ignored. The deployment scripts preserve this file and Docker Compose loads the credentials from it. Restart the backend after changing credentials.

The test key ID currently in use is `rzp_test_S7dlJIqMvrpcaj`. Store its matching secret only in the private `backend/.env`; never commit API secrets. A test key pair puts checkout in test mode and cannot process live transactions. Do not pair a test key ID with a live secret.

The customer portal creates Razorpay orders on the backend and credits a wallet only after the backend verifies the checkout signature and confirms the payment is captured for the expected amount and customer.
