/* this is another take!
* Copyright 2016-present, Facebook, Inc.
* All rights reserved.
* This source code is licensed under the license found in the
* LICENSE file in the root directory of this source tree.
/* jshint node: true, devel: true */
'use strict';
const
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  request = require('request'),
  oneLinerJoke = require('one-liner-joke'),
  changeCase = require('change-case'),
  mongoose = require('mongoose'),
  _ = require('underscore'),
  words = ['onboard'],
  autocorrect = require('autocorrect')({words: words})
var Client = require('coinbase').Client;
var client = new Client({
  'apiKey': 'API KEY',
  'apiSecret': 'API SECRET'
});
var marketData;
var currencies;
var currencyName;
var currentPrice;
var newPrice;
var currency_code = 'USD';
var dateFormat = require('dateformat');
// var time = require('time');
var weather = require('weather-js');
var google_speech = require('google-speech');
var Nuance = require('nuance');
var nuance = new Nuance('appID', 'appKey');

// mongodb configuration
mongoose.connection.on('connected', function() {
  console.log('Success: connected to MongoDb!');
});
mongoose.connection.on('error', function() {
  console.log('Error connecting to MongoDb. Check MONGODB_URI in config.js');
  process.exit(1);
});
mongoose.connect(process.env.MONGODB_URI);

var User = require('./models/user').User;
var coinbaseUser = require('./models/user').coinbaseUser;

var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = (process.env.MESSENGER_APP_SECRET) ?
process.env.MESSENGER_APP_SECRET :
config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.MESSENGER_VALIDATION_TOKEN) ?
(process.env.MESSENGER_VALIDATION_TOKEN) :
config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
(process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
config.get('pageAccessToken');

// URL where the app is running (include protocol). Used to point to scripts and
// assets located at this address.
const SERVER_URL = (process.env.SERVER_URL) ?
(process.env.SERVER_URL) :
config.get('serverURL');

const COINBASE_SECRET = process.env.COINBASE_SECRET;
const COINBASE_CLIENTID = process.env.COINBASE_CLIENTID;

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
  console.error("Missing config values");
  process.exit(1);
}

// COINBASE CRAPPPPPP
app.get('/coinbaseCallback', function(req,res){

  var postUrl = 'https://api.coinbase.com/oauth/token';
  console.log(postUrl);
  if (req.query.code){
    request.post(postUrl,
      {
        form:
        {
          grant_type:'authorization_code',
          code:req.query.code,
          client_id: COINBASE_CLIENTID,
          client_secret: COINBASE_SECRET,
          redirect_uri: 'https://fathomless-brushlands-25447.herokuapp.com/coinbaseCallback?id='+req.query.id
        },
        json: true
      },
      function(err, httpResponse, body){
        console.log(body);
        var token = body.access_token;
        var refresh = body.refresh_token;

        coinbaseUser.findOne({recipientId: req.query.id}, function(err,foundUser){
          if (err) {
            console.log('1');
            res.send(err)
          } else if (!foundUser) {
            var newUser = new coinbaseUser({recipientId: req.query.id, access_token: token, refresh_token: refresh});
            newUser.save(function(err){
              if (err){
                console.log ('2');
                res.send(err)
              } else {
                res.send(body);
              }
            })
          } else {
            if (foundUser.access_token === token && foundUser.refresh_token === refresh) {
              res.send(body);
            } else {
              foundUser.access_token = token;
              foundUser.refresh_token = refresh;
              foundUser.save(function(err) {
                if (err){
                  console.log ('2');
                  res.send(err)
                } else {
                  res.send(body);
                }
              })
            }
          }
        })
        // User.findOrCreate({recipientId: req.query.id, access_token:body.access_token, refresh_token:body.refresh_token}, function (err, user) {
        //   if (err) {
        //     res.sendStatus(500).json(err);
        //   } else {
        //     res.send(body)
        //   }
        // });
      }
    );
  }
})

/*
* Use your own validation token. Check that the token used in the Webhook
* setup is the same token used here.
*
*/
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
  req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

app.get('/postaudio', function(req, res){
  request.post('https://speech.googleapis.com/v1beta1/speech:syncrecognize',{
    json:{
      'config': {
        // 'encoding':'FLAC',
        // 'sampleRate': 16000,
        'languageCode': 'en-US'
      },
      'audio': {
        'uri':'http://bshre.co/spmz'
      }
    }
  }, function (error, response, body) {
    res.json({
      error: error,
      response: response,
      body: body
    })
    if (!error && response.statusCode == 200) {
      res.json({
        body: body,
        comment: 'there was no error',
        statusCode: response.statusCode
      }) //
    } else res.json({
      error: error,
      comment: 'there was an error',
      statusCode: response.statusCode
    });
  })
})

/*
* All callbacks for Messenger are POST-ed. They will be sent to the same
* webhook. Be sure to subscribe your app to your page to receive callbacks
* for your page.
* https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
*
*/
app.post('/webhook', function (req, res) {
  var data = req.body;
  // Make sure this is a page subscription
  if (data.object == 'page') {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else if (messagingEvent.read) {
          receivedMessageRead(messagingEvent);
        } else if (messagingEvent.account_linking) {
          receivedAccountLink(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know you've
    // successfully received the callback. Otherwise, the request will time out.
    res.sendStatus(200);
  }
});

app.post('/me/thread_settings?access_token=' + process.env.MESSENGER_PAGE_ACCESS_TOKEN)
/*
* This path is used for account linking. The account linking call-to-action
* (sendAccountLinking) is pointed to this URL.
*
*/
app.get('/authorize', function(req, res) {
  var accountLinkingToken = req.query.account_linking_token;
  var redirectURI = req.query.redirect_uri;

  // Authorization Code should be generated per user by the developer. This will
  // be passed to the Account Linking callback.
  var authCode = "1234567890";

  // Redirect users to this URI on successful login
  var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

  res.render('authorize', {
    accountLinkingToken: accountLinkingToken,
    redirectURI: redirectURI,
    redirectURISuccess: redirectURISuccess
  });
});
/*
* Verify that the callback came from Facebook. Using the App Secret from
* the App Dashboard, we can verify the signature that is sent with each
* callback in the x-hub-signature field, located in the header.
*
* https://developers.facebook.com/docs/graph-api/webhooks#setup
*
*/
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];
  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];
    var expectedHash = crypto.createHmac('sha1', APP_SECRET)
    .update(buf)
    .digest('hex');
    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}
/*
* Authorization Event
*
* The value for 'optin.ref' is defined in the entry point. For the "Send to
* Messenger" plugin, it is the 'data-ref' field. Read more at
* https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
*
*/
function receivedAuthentication(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfAuth = event.timestamp;
  // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
  // The developer can set this to an arbitrary value to associate the
  // authentication callback with the 'Send to Messenger' click event. This is
  // a way to do account linking when the user clicks the 'Send to Messenger'
  // plugin.
  var passThroughParam = event.optin.ref;
  console.log("Received authentication for user %d and page %d with pass " +
  "through param '%s' at %d", senderID, recipientID, passThroughParam,
  timeOfAuth);

  // When an authentication is received, we'll send a message back to the sender
  // to let them know it was successful.
  sendTextMessage(senderID, "Authentication successful");
}
/*
* Message Event
*
* This event is called when a message is sent to your page. The 'message'
* object format can vary depending on the kind of message that was received.
* Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
*/
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;
  // FIX THIS
  // var myUser = {};
  // // initial save of user information if he doesnt exist already
  User.findOne({userId: senderID}, function(err, foundUser) {
    if(!foundUser) {
      var user = new User({
        userId: senderID,
        preferredExchange: [],
        preferredTime: ''
      }).save();
    }
  })
  // console.log('outside!')
  // console.log(myUser);
  // var myCurrency = myUser.preferredExchange[0];
  // var myTime = myUser.preferredTime;
  console.log("Received message for user %d and page %d at %d with message:",
  senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));
  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;
  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var quickReply = message.quick_reply;
  if (isEcho) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s",
    messageId, appId, metadata);
    return;
  } else if (quickReply) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s",
    messageId, quickReplyPayload);
    if(quickReplyPayload === 'bitstamp') {
      var arr = [];
      arr.push('bitstamp');
      User.findOneAndUpdate({userId: senderID}, {preferredExchange: arr}, function(err, foundUser) {
        console.log(foundUser);
      })
      return sendTextMessage(senderID, 'Saved.');
    } else if(quickReplyPayload === 'buy') {
        return sendTextMessage(senderID, "Will be implemented soon :)")
    } else if(quickReplyPayload === 'sell') {
        return sendTextMessage(senderID, "Will be implemented soon :)")
    } else if(quickReplyPayload === 'coinbase') {
      var arr = [];
      arr.push('coinbase');
      User.findOneAndUpdate({userId: senderID}, {preferredExchange: arr}, function(err, foundUser) {
        console.log(foundUser);
      })
      return sendTextMessage(senderID, 'Saved.');
      // else if(quickReplyPayload === 'otherExchange') {
      //   return sendTextMessage(senderID, "Hmmmm idk what to do then b");
      // ROUTING PURPOSES
    } else if(quickReplyPayload === 'exchange'){
      return exchangeReply(senderID);
    } else if(quickReplyPayload === 'alert'){
      return alertReply(senderID);
    } else if(quickReplyPayload === 'morning'){
      var preferredTime = 'morning';
      User.findOneAndUpdate({userId: senderID}, {preferredTime: preferredTime}, function(err, foundUser) {
        console.log(foundUser);
      })
      return sendTextMessage(senderID, 'Saved.');
    } else if(quickReplyPayload === 'noon'){
      var preferredTime = 'noon';
      User.findOneAndUpdate({userId: senderID}, {preferredTime: preferredTime}, function(err, foundUser) {
        console.log(foundUser);
      })
      return sendTextMessage(senderID, 'Saved.');
    } else if(quickReplyPayload === 'afternoon'){
      var preferredTime = 'afternoon';
      User.findOneAndUpdate({userId: senderID}, {preferredTime: preferredTime}, function(err, foundUser) {
        console.log(foundUser);
      })
      return sendTextMessage(senderID, 'Saved.');
      // }
      // // sendTextMessage(senderID, "Quick reply tapped");
      // return;
    }
  }

  var check = _.some(currencies.data, function(currency) {
      currencyName = currency.name
      return currency.id === messageText;
    });
    if(check){
      currency_code = messageText;
      sendTextMessage(senderID, `Currency set to ${currencyName}`);
    }

  else if (messageText) {
    console.log('inside message text')
    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (changeCase.lowerCase(messageText)) {
      case 'ticker':
      request('https://www.bitstamp.net/api/v2/ticker/btcusd/', function(error, response, body) {
        if (!error && response.statusCode == 200) {
          var msg = JSON.parse(body);
          var newMsg = "High: " + msg.high + "\n" + "Low: " + msg.low + "\n" + "Open: " + msg.open + "\n \n" + "Source: Bitstamp"
          sendTextMessage(senderID, newMsg);
        }
      })
      break;

      case 'menu':
      var msg = "You have the following options: \n\nAuth: authorize your Coinbase wallet. \nBest Buy: view the best buying price. \nBest Sell: view the best selling price. \nBitcoin: buy or sell BTC. \nBriefing: view all relevant current information. \nBuy Price: current buy price on Coinbase. \nCharts: view charts via Bitstamp or Coinbase. \nDetails: detailed. live pricing information. \nHaha: wanna hear a joke?. \nMenu: view all commands. \nPreferences: change information or notification preferences. \nBuy Price: quick buy-price check. \nSell Price: quick sell-price check."
      return sendTextMessage(senderID, msg)
      break;

      case 'auth':
      authorizeCoinbase(senderID);
      break;

      case 'audio':
      sendAudioMessage(senderID);
      break;

      case 'details':
      request('https://www.bitstamp.net/api/v2/ticker/btcusd/', function(error, response, body) {
        if (!error && response.statusCode == 200) {
          var msg = JSON.parse(body);
          var newMsg = "Live, detailed pricing information:" + "\n\nHigh: " + msg.high + "\nLow: " + msg.low + "\nOpen: " + msg.open + "\nLast: " + msg.last + "\nBid: " + msg.bid + "\nAsk: " + msg.ask + "\nVolume: " + msg.volume + "\n\nSource: Bitstamp"
          sendTextMessage(senderID, newMsg);
        }
      })
      break;

      case 'add menu':
      addPersistentMenu();
      break;

      case 'charts':
        sendGenericMessage(senderID);
        break;

      case 'haha':
      var getRandomJoke = oneLinerJoke.getRandomJoke();
      sendTextMessage(senderID, getRandomJoke.body);
      break;

      case 'preferences':
      // sendTextMessage(senderID, "What is your preferred exchange?");
      console.log('here in preferences')
      preferencesReply(senderID);
      break;

      case 'don dyu':
      sendGifMessage(senderID);
      break;

      case 'onboard': // deprecated because of "getting started" button
      var msg = "At any time, you may type 'menu' to get a complete list of functions. We hope you enjoy using Botty.";
      sendAudioMessage(senderID);
      sendTextMessage(senderID, msg);
      break;

      case 'best buy':
      client.getBuyPrice({'currencyPair': 'BTC-USD'},function(err, coinPrice) {
        request('https://www.bitstamp.net/api/v2/ticker/btcusd/', function(error, response, body) {
          if (!error && response.statusCode == 200) {
            var msg = JSON.parse(body);
            var pick = (msg.bid > coinPrice.data.amount ? "Coinbase" : "Bitstamp")
            var newMsg="I would recommend buying from " + pick + ".\n\nBitstamp: " + msg.bid + "\nCoinbase: " + coinPrice.data.amount;
            sendTextMessage(senderID, newMsg);
          }
        })
      });
      break;

      case 'best sell':
      client.getSellPrice({'currencyPair': 'BTC-USD'},function(err, coinPrice) {
        request('https://www.bitstamp.net/api/v2/ticker/btcusd/', function(error, response, body) {
          if (!error && response.statusCode == 200) {
            var msg = JSON.parse(body);
            var pick = (msg.ask > coinPrice.data.amount ? "Bitstamp" : "Coinbase")
            var newMsg="I would recommend selling on " + pick + ".\n\nBitstamp: " + msg.ask + "\nCoinbase: " + coinPrice.data.amount;
            sendTextMessage(senderID, newMsg);
          }
        })
      });
      break;

      case 'buy price':
      client.getBuyPrice({'currencyPair': 'BTC-USD'},function(err, price) {
        sendTextMessage(senderID, 'Current bitcoin buying price in ' + 'USD' + ': ' +  price.data.amount)
      });
      break;

      case 'price':
      client.getSpotPrice({'currency': 'usd'},function(err, price) {
        sendTextMessage(senderID, 'Current bitcoin price in' + 'usd' + ': ' +  price.data.amount)
      });
      break;

      case 'sell price':
      client.getSellPrice({'currencyPair': 'BTC-USD'},function(err, price) {
        sendTextMessage(senderID, 'Current bitcoin selling price in ' + 'USD' + ': ' +  price.data.amount)
      });
      break;

      case 'bitcoin':
      // sendBitcoin(senderID);
      sendBitcoinMessage(senderID);
      break;

      case 'bit buttons':
        sendButtonMessage(senderID);
        break;

        case 'briefing':
        weather.find({search: 'San Francisco, CA', degreeType: 'F'}, function(err, realWeather) {
          var givenWeather = JSON.stringify(realWeather);
          var myWeather = JSON.parse(givenWeather);
          console.log('weather', myWeather[0])
          var currentTemp = myWeather[0].current.temperature;
          // });
          var now = new Date();
          // var currentTime = dateFormat(now, "h:MM:ss TT");
          var currentDate = dateFormat(now, "dddd, mmmm dS, yyyy");
          client.getSpotPrice({'currency': currency_code}, function(err, price) {
            var spot = price.data.amount;
            client.getSellPrice({'currencyPair': `BTC-${currency_code}`}, function(err, price) {
              var sell = price.data.amount;
              client.getBuyPrice({'currencyPair': `BTC-${currency_code}`}, function(err, price) {
                var buy = price.data.amount;
                client.getTime(function(err, time) {
                  var time = time.data.iso;
                  var msg = 'Weather in San Francisco: ' + currentTemp + ' F' + '\nDate: ' + currentDate + '\n\nCurrent pricing information:' + '\n\n' +
                  'Sell: ' + sell + '\n' + 'Buy: ' + buy + '\n' + 'Spot: ' + spot + '\n\nSource: Coinbase';
                  sendTextMessage(senderID, msg);
                })
              })
            })
          });
        });
        break;
      // case messageText:
      //     var msg = "Did you mean... " + autocorrect(messageText) +
      //     sendCorrectMsg(senderID, msg, messageText);
      //     break;
      default:
      sendTextMessage(senderID, "Sorry, I could not recognize the command " + "'" + messageText + "'. Please try again, or type 'menu' to review your options.");
    }
  } else if (messageAttachments) {
    console.log('YOOOOOOO BRO')
    console.log(messageAttachments);
    sendTextMessage(senderID, "Message with attachment received");
  }
}
////////////////////////// ADDING MENUS
function addPersistentMenu(){
  request({
    url: 'https://graph.facebook.com/v2.6/me/thread_settings',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json:{
      setting_type : "call_to_actions",
      title: "Toolbar",
      thread_state : "existing_thread",
      call_to_actions:[
        {
          type:"postback",
          title:"Menu",
          payload:"menu"
        },
        {
          type:"postback",
          title:"Quick Look",
          payload:"quick"
        },
        {
          type:"postback",
          title:"I\'m bored",
          payload:"joke"
        }
      ]
    }
  }, function(error, response, body) {
    console.log(response)
    if (error) {
      console.log('Error sending messages: ', error)
    } else if (response.body.error) {
      console.log('Error: ', response.body.error)
    }
  })
}

// COINBASE function
function authorizeCoinbase(recipientId) {
  console.log(recipientId)
  console.log(typeof recipientId)
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Click to Configure Coinbase",
          buttons:[{
            type: "web_url",
            url: "https://www.coinbase.com/oauth/authorize?response_type=code&client_id=" + COINBASE_CLIENTID + "&redirect_uri=" + encodeURIComponent("https://fathomless-brushlands-25447.herokuapp.com/coinbaseCallback?id="+recipientId),
            title: "Authorize"
          }]
        }
      }
    }
  };
  callSendAPI(messageData);
}

/*
* Delivery Confirmation Event
* This event is sent to confirm the delivery of a message. Read more about
* these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
*/
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("Received delivery confirmation for message ID: %s",
      messageID);
    });
  }

  console.log("All message before %d were delivered.", watermark);
}


/*
* Postback Event
* This event is called when a postback is tapped on a Structured Message.
* https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
*/
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;
  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;
  if (payload === "Buy_Price"){
    client.getBuyPrice({'currencyPair': 'BTC-USD'}, function(err, price) {
      return sendTextMessage(senderID, 'Current bitcoin buying price in ' + 'USD' + ': ' +  price.data.amount + "\nSource: Coinbase")
    });
  }

  else if(payload === 'gettingStarted'){
    var msg = "Thanks for checking out Botty, your personal crypto-bot. To learn more about how I can help you, type 'onboard'."
    sendTextMessage(senderID, msg);
      setInterval(function(){
        client.getSpotPrice({'currency': currency_code}, function(err, price) {
          // console.log('Current bitcoin price in ' + currency_code + ': ' +  price.data.amount);
          newPrice = price.data.amount;
          var percentChange = (((currentPrice - newPrice)/currentPrice)*100).toFixed(3);
          if(percentChange < -0.001) {
            percentChange = Math.abs(percentChange);
            sendTextMessage(senderID, `[PRICE WATCH]: ${percentChange}% increase in price \nCurrent Price: ${newPrice}`)
            currentPrice = newPrice
          } else if (percentChange > 0.001) {
            percentChange = Math.abs(percentChange);
            sendTextMessage(senderID, `[PRICE WATCH]: ${percentChange}% decrease in price \nCurrent Price: ${newPrice}`)
            currentPrice = newPrice
          }
          })
      },10000);
    }
  // else if(payload === 'gettingStarted') {
  //   // COPY CASE MENU
  //   var msg = "Thanks for checking out Botty, your personal crypto-plug. We have a plethora of features in store for you. To learn more about how I can help you, type 'onboard'."
  //   return sendTextMessage(senderID, msg);

   else if (payload === "Sell_Price"){
    client.getSellPrice({'currencyPair': 'BTC-USD'}, function(err, price) {
      return sendTextMessage(senderID, 'Current bitcoin selling price in ' + 'USD' + ': ' +  price.data.amount)
    });
  } else if (payload === "Price"){
    client.getSpotPrice({'currency': 'USD'}, function(err, price) {
      return sendTextMessage(senderID, 'Current bitcoin price in USD:' +  price.data.amount)
    });
  } else if (payload === "joke"){
    var getRandomJoke = oneLinerJoke.getRandomJoke();
    return sendTextMessage(senderID, getRandomJoke.body);
  } else if (payload === "menu"){
    var msg = "You have the following options: \n\nAuth: authorize your Coinbase wallet. \nBest Buy: view the best buying price. \nBest Sell: view the best selling price. \nBitcoin: buy or sell BTC. \nBriefing: view all relevant current information. \nBuy Price: current buy price on Coinbase. \nCharts: view charts via Bitstamp or Coinbase. \nDetails: detailed. live pricing information. \nHaha: wanna hear a joke?. \nMenu: view all commands. \nPreferences: change information or notification preferences. \nBuy Price: quick buy-price check. \nSell Price: quick sell-price check."
    return sendTextMessage(senderID, msg)
  } else if (payload === "quick"){
    client.getSpotPrice({'currency': 'USD'}, function(err, price) {
      var spot = price.data.amount;
      client.getSellPrice({'currencyPair': 'BTC-USD'}, function(err, price) {
        var sell = price.data.amount;
        client.getBuyPrice({'currencyPair': 'BTC-USD'}, function(err, price) {
          var buy = price.data.amount;
          client.getTime(function(err, time) {
            var time = time.data.iso;
            var msg = 'Real-time pricing information:' + '\n\n' +
            'Sell: ' + sell + '\n' + 'Buy: ' + buy + '\n' + 'Spot: ' + spot + '\n\nSource: Coinbase';
            return sendTextMessage(senderID, msg);
          })
        })
      })
    });
  }
  console.log("Received postback for user %d and page %d with payload '%s' " +
  "at %d", senderID, recipientID, payload, timeOfPostback);
}
  // When a postback is called, we'll send a message back to the sender to
  // let them know it was successful
  // sendTextMessage(senderID, "Postback called");

/*
* Message Read Event
*
* This event is called when a previously-sent message has been read.
* https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
*
*/
function receivedMessageRead(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  // All messages before watermark (a timestamp) or sequence have been seen.
  var watermark = event.read.watermark;
  var sequenceNumber = event.read.seq;

  console.log("Received message read event for watermark %d and sequence " +
  "number %d", watermark, sequenceNumber);
}
/*
* Account Link Event
*
* This event is called when the Link Account or UnLink Account action has been
* tapped.
* https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
*
*/
function receivedAccountLink(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  var status = event.account_linking.status;
  var authCode = event.account_linking.authorization_code;

  console.log("Received account link event with for user %d with status %s " +
  "and auth code %s ", senderID, status, authCode);
}

/*
* Send an image using the Send API.
*
*/
// THIS IS TO CREATE BITCOIN - BUTTONS
function sendBitcoin(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Select your transaction below (via Coinbase)",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Buy BTC",
          "payload":"buy"
        },
        {
          "content_type":"text",
          "title":"Sell BTC",
          "payload":"sell"
        }
      ]
    }
  };
  callSendAPI(messageData);
}

function sendImageMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: "https://bitcoincharts.com/charts/chart.png?width=940&m=bitstampUSD&SubmitButton=Draw&r=60&i=&c=0&s=&e=&Prev=&Next=&t=S&b=&a1=&m1=10&a2=&m2=25&x=0&i1=&i2=&i3=&i4=&v=1&cv=0&ps=0&l=0&p=0&"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
* Send a Gif using the Send API.
*
*/

function sendGifMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: "https://j.gifs.com/lOm4W1.gif"
        }
      }
    }
  };
  callSendAPI(messageData);
}

/*
* Send audio using the Send API.
*
*/
function sendAudioMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "audio",
        payload: {
          url: "http://www.fromtexttospeech.com/output/0714078001487351330/21101657.mp3"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
* Send a video using the Send API.
*
*/
function sendVideoMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "video",
        payload: {
          url: SERVER_URL + "/assets/allofus480.mov"
        }
      }
    }
  };
  callSendAPI(messageData);
}

/*
* Send a file using the Send API.
*
*/
function sendFileMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "file",
        payload: {
          url: SERVER_URL + "/assets/test.txt"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
* Send a text message using the Send API.
* OK THIS IS IMPORTANT!
*/
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText,
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}

/*
* Send a button message using the Send API.
*
*/
function sendButtonMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "This is test text",
          buttons:[{
            type: "web_url",
            url: "http://bitcointicker.co/coinbase/",
            title: "Go to live ticker"
          }, {
            type: "postback",
            title: "Trigger Postback",
            payload: "DEVELOPER_DEFINED_PAYLOAD"
          }, {
            type: "phone_number",
            title: "Call Phone Number",
            payload: "+16505551234"
          }]
        }
      }
    }
  };
  callSendAPI(messageData);
}

function sendBitcoinMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Bitcoin Transactions (via Coinbase)",
          buttons:[{
            type: "web_url",
            url: "https://www.coinbase.com/buy",
            title: "Buy BTC"
          }, {
            type: "web_url",
            url: "https://www.coinbase.com/sell",
            title: "Sell BTC"
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
* Send a Structured Message (Generic Message type) using the Send API.
*
*/
function sendGenericMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Bitstamp",
            subtitle: "BTC-USD",
            item_url: "https://www.bitstamp.net/market/tradeview/",
            image_url: 'https://btc.ng/wp-content/uploads/2016/04/Screen-Shot-2015-01-06-at-09.01.51.png',
            buttons: [{
              type: "web_url",
              url: "https://www.bitstamp.net/market/tradeview/",
              title: "View Charts"
            }],
          }, {
            title: "Coinbase",
            subtitle: "BTC-USD",
            item_url: "https://www.coinbase.com/charts?locale=en",
            image_url: 'https://s3.amazonaws.com/bittrust/coinbase_logo_white.png',
            buttons: [{
              type: "web_url",
              url: "http://btc-times.com/wp-content/uploads/2017/01/Coinbase.jpg",
              title: "View Charts"
            }]
          }]
        }
      }
    }
  };
  callSendAPI(messageData);
}

/*
* Send a receipt message using the Send API.
*
*/
function sendReceiptMessage(recipientId) {
  // Generate a random receipt ID as the API requires a unique ID
  var receiptId = "order" + Math.floor(Math.random()*1000);

  var messageData = {
    recipient: {
      id: recipientId
    },
    message:{
      attachment: {
        type: "template",
        payload: {
          template_type: "receipt",
          recipient_name: "Peter Chang",
          order_number: receiptId,
          currency: "USD",
          payment_method: "Visa 1234",
          timestamp: "1428444852",
          elements: [{
            title: "Oculus Rift",
            subtitle: "Includes: headset, sensor, remote",
            quantity: 1,
            price: 599.00,
            currency: "USD",
            image_url: SERVER_URL + "/assets/riftsq.png"
          }, {
            title: "Samsung Gear VR",
            subtitle: "Frost White",
            quantity: 1,
            price: 99.99,
            currency: "USD",
            image_url: SERVER_URL + "/assets/gearvrsq.png"
          }],
          address: {
            street_1: "1 Hacker Way",
            street_2: "",
            city: "Menlo Park",
            postal_code: "94025",
            state: "CA",
            country: "US"
          },
          summary: {
            subtotal: 698.99,
            shipping_cost: 20.00,
            total_tax: 57.67,
            total_cost: 626.66
          },
          adjustments: [{
            name: "New Customer Discount",
            amount: -50
          }, {
            name: "$100 Off Coupon",
            amount: -100
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
* Send a message with Quick Reply buttons.
*
*/
function sendQuickReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "What's your favorite movie genre?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Action",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_ACTION"
        },
        {
          "content_type":"text",
          "title":"Comedy",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_COMEDY"
        },
        {
          "content_type":"text",
          "title":"Drama",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_DRAMA"
        }
      ]
    }
  };
  callSendAPI(messageData);
}

//// CUSTOM QUICK REPLY
function preferencesReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "What would you like to configure?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Exchange",
          "payload":"exchange"
        },
        {
          "content_type":"text",
          "title":"Alert Frequency",
          "payload":"alert"
        },
        {
          "content_type":"text",
          "title":"Other",
          "payload":"otherPreferences"
        }
      ]
    }
  };
  callSendAPI(messageData);
}

function exchangeReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "What is your preferred exchange?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Bitstamp",
          "payload":"bitstamp"
        },
        {
          "content_type":"text",
          "title":"Coinbase",
          "payload":"coinbase"
        },
        {
          "content_type":"text",
          "title":"Other",
          "payload":"otherExchange"
        }
      ]
    }
  };
  callSendAPI(messageData);
}

function alertReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "When would you like to be notified during the day? (EST)",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Morning",
          "payload":"morning"
        },
        {
          "content_type":"text",
          "title":"Noon",
          "payload":"coinbase"
        },
        {
          "content_type":"text",
          "title":"Afternoon",
          "payload":"afternoon"
        }
      ]
    }
  };
  callSendAPI(messageData);
}

/*
* Send a read receipt to indicate the message has been read
*
*/
function sendReadReceipt(recipientId) {
  console.log("Sending a read receipt to mark message as seen");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "mark_seen"
  };

  callSendAPI(messageData);
}

/*
* Turn typing indicator on
*
*/
function sendTypingOn(recipientId) {
  console.log("Turning typing indicator on");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_on"
  };

  callSendAPI(messageData);
}

/*
* Turn typing indicator off
*
*/
function sendTypingOff(recipientId) {
  console.log("Turning typing indicator off");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_off"
  };

  callSendAPI(messageData);
}

/*
* Send a message with the account linking call-to-action
*
*/
function sendAccountLinking(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Welcome. Link your account.",
          buttons:[{
            type: "account_link",
            url: SERVER_URL + "/authorize"
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
* Call the Send API. The message data goes in the body. If successful, we'll
* get the message id in a response
*
*/
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;
      if (messageId) {
        console.log("Successfully sent message with id %s to recipient %s",
        messageId, recipientId);
      } else {
        console.log("Successfully called Send API for recipient %s",
        recipientId);
      }
    } else {
      console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
    }
  });
}

function setGreetingText() {
  var greetingData = {
    "setting_type":"call_to_actions",
    "thread_state":"new_thread",
    "greeting": {
      text: "Hi {{user_first_name}}! \n Welcome to our onboarding process. To begin, please hit 'Get Started'." // this part is overwritten by fb
    },
    "call_to_actions":[
      {
        "payload":"gettingStarted"
      }]
    }
    createGreetingApi(greetingData);
  }

  function createGreetingApi(data) {
    request({
      uri: 'https://graph.facebook.com/v2.6/me/thread_settings',
      qs: { access_token: PAGE_ACCESS_TOKEN },
      method: 'POST',
      json: data

    }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log("Greeting set successfully!");
      } else {
        console.error("Failed calling Thread Reference API", response.statusCode, response.statusMessage, body.error);
      }
    });
  }

  // function setGreetingText() {
  //   var greetingData = {
  //     setting_type: "greeting",
  //     greeting:{
  //       text:"Hi {{user_first_name}}! \n Welcome to our onboarding process. To begin, please type 'onboard'."
  //     }
  //   };
  //   createGreetingApi(greetingData);
  // // }

  // Start server
  // Webhooks must be available via SSL with a certificate signed by a valid
  // certificate authority.
  app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
    setGreetingText();

    request('https://api.coinbase.com/v2/currencies', function(err,res,body){
      if(!err && res.statusCode === 200) {
        currencies = JSON.parse(body);
      }
    })
    client.getSpotPrice({'currency': currency_code}, function(err, price) {
      currentPrice = price.data.amount;
    });
  });

  module.exports = app;
