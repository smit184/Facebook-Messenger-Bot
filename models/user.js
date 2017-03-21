"use strict";

var mongoose = require('mongoose');

var User = mongoose.model('User', {
  userId: {
    type: String,
    required: true
  },
  preferredExchange: {
    type: Array
  },
  preferredTime: {
    type: String
  }
});

var coinbaseUserSchema = new mongoose.Schema({
  recipientId: String,
  access_token: String,
  refresh_token: String
});

var coinbaseUser = mongoose.model('coinbaseUser', coinbaseUserSchema)

module.exports = {
  User: User,
  coinbaseUser: coinbaseUser
}
