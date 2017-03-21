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
})

module.exports = {
  User: User
}
