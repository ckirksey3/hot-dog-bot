// START HEROKU SETUP
var express = require("express");
var app = express();
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var rekognition = new AWS.Rekognition();
var request = require('request').defaults({ encoding: null });
app.get('/', function(req, res){ res.send('The robot is happily running.'); });
app.listen(process.env.PORT || 5000);
// END HEROKU SETUP


// Listbot config
//
// Config.keys uses environment variables so sensitive info is not in the repo.
var config = {
    me: 'IsItAHotdog', // The authorized account with a list to retweet.
    regexFilter: '', // Accept only tweets matching this regex pattern.
    regexReject: '', // AND reject any tweets matching this regex pattern.

    keys: {
        consumer_key: process.env.TWITTER_CONSUMER_KEY,
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
        access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
        access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
    },
};

// What to do after we retweet something.
function onReTweet(err) {
    if(err) {
        console.error("retweeting failed :(");
        console.error(err);
    }
}

function tweetBasedOnCategorization(tweet, isItAHotdog) {
    var message = " This is NOT a hotdog";
    if(isItAHotdog) {
        message = " This is a hotdog";
    }
    tu.update({
        status: "@" + tweet.user.screen_name + message,
        in_reply_to_status_id: tweet.id_str
    }, onReTweet);
}

// What to do when we get a tweet.
function onTweet(tweet) {
    // Reject the tweet if:
    //  1. it's flagged as a retweet
    //  2. it matches our regex rejection criteria
    //  3. it doesn't match our regex acceptance filter
    var regexReject = new RegExp(config.regexReject, 'i');
    var regexFilter = new RegExp(config.regexFilter, 'i');
    if (tweet.retweeted) {
        return;
    }
    if (config.regexReject !== '' && regexReject.test(tweet.text)) {
        return;
    }
    if (regexFilter.test(tweet.text)) {
        console.log(tweet);
        // Note we're using the id_str property since javascript is not accurate
        // for 64bit ints.
        var has_image = false;
        var image_url = '';
        if(tweet.entities.hasOwnProperty('media') && tweet.entities.media.length > 0) {
            has_image = true;
            image_url = tweet.entities.media[0]['media_url'];
        } else if (tweet.hasOwnProperty('extended_tweet')) {
            if(tweet.extended_tweet.entities.hasOwnProperty('media') && tweet.extended_tweet.entities.media.length > 0) {
                has_image = true;
                image_url = tweet.extended_tweet.entities.media[0]['media_url'];
            }
        }
        if(has_image) {
            request.get(image_url, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var params = {
                        Image: { 
                            Bytes: body
                        },
                        MaxLabels: 20,
                        MinConfidence: 70
                    };
                    rekognition.detectLabels(params, function(err, data) {
                        if (err) console.log(err, err.stack); // an error occurred
                        else {
                            console.log(data);           // successful response
                            var isItAHotdog = false;
                            for (var label_index in data.Labels) {
                                var label = data.Labels[label_index];
                                if(label['Name'] == "Hot Dog") {
                                   if(label['Confidence'] > 85) {
                                        isItAHotdog = true;
                                        tweetBasedOnCategorization(tweet, true);
                                    }
                                }
                            }
                            if(isItAHotdog == false) {
                                tweetBasedOnCategorization(tweet, false);
                            }
                        }
                    });
                }
            });
        } else {
            console.log("Tweet did not have an image")
        }
        
    }
}

// Function for listening to twitter streams and retweeting on demand.
function listen() {
    tu.filter({
        track: 'isitahotdog'
    }, function(stream) {
        console.log("listening to stream");
        stream.on('tweet', onTweet);
    });
}

// The application itself.
// Use the tuiter node module to get access to twitter.
var tu = require('tuiter')(config.keys);

// Run the application. The callback in getListMembers ensures we get our list
// of twitter streams before we attempt to listen to them via the twitter API.
listen();
