# Botty: A Facebook Messenger bot built in Node.js

This project came to fruition during a hackaton. Our team featured four members: Andrew Min, Don Kim, Irvin Tang, and Smit Patel.

It offers the following functionality:

* Real-time pricing updates
* Pulls live pricing data from GDAX (Coinbase) and Bitstamp exchanges
* Bitcoin wallet access via Coinbase

## Setup

We primarily followed the guidelines outlined in Facebook's documentation. Our app is being hosted on Heroku, with a Mongo database in use in the background, as well as implementation of the Coinbase and Bitstamp APIs.

## Future Updates

Currently, we are working on improving the onboarding process and use-flow. Additional use-cases are also being considered. The bot itself is not yet officially approved on Facebook; testing has primarily been using local/process.env variables. Scalability coming soon.
