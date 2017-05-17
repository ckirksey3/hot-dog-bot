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
    myList: 'cool-people', // The list we want to retweet.
    regexFilter: '', // Accept only tweets matching this regex pattern.
    regexReject: '(RT|@)', // AND reject any tweets matching this regex pattern.

    keys: {
        consumer_key: process.env.TWITTER_CONSUMER_KEY,
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
        access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
        access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
    },
};


// Get the members of our list, and pass them into a callback function.
function getListMembers(callback) {
    var memberIDs = [];

    tu.listMembers({owner_screen_name: config.me,
        slug: config.myList
    },
    function(error, data){
        if (!error) {
            for (var i=0; i < data.users.length; i++) {
                memberIDs.push(data.users[i].id_str);
            }

            // This callback is designed to run listen(memberIDs).
            callback(memberIDs);
        } else {
            console.log(error);
            console.log(data);
        }
    });
}

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
        if(tweet.entities.hasOwnProperty('media') && tweet.entities.media.length > 0) {
            var image_url = tweet.entities.media[0]['media_url'];
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
function listen(listMembers) {
    tu.filter({
        follow: listMembers
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
getListMembers(listen);
