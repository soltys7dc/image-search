'use strict';
const port = process.env.PORT || 3003;
const mongoURL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const apiKey = process.env.API_KEY;
const dbName = 'image-search';

const fs = require('fs');
const express = require('express');
const app = express();
const MongoClient = require('mongodb').MongoClient;
const request = require('request');
const querystring = require('querystring');

let connected = null;
const connection = () => {
  if (connected) {
    return connected;
  }
  return connected = MongoClient.connect(mongoURL);
}

if (!process.env.DISABLE_XORIGIN) {
  app.use(function(req, res, next) {
    var allowedOrigins = ['https://narrow-plane.gomix.me', 'https://www.freecodecamp.com'];
    var origin = req.headers.origin || '*';
    if(!process.env.XORIG_RESTRICT || allowedOrigins.indexOf(origin) > -1){
         console.log(origin);
         res.setHeader('Access-Control-Allow-Origin', origin);
         res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    }
    next();
  });
}

app.use('/public', express.static(process.cwd() + '/public'));

app.route('/_api/package.json')
  .get(function(req, res, next) {
    console.log('requested');
    fs.readFile(__dirname + '/package.json', function(err, data) {
      if(err) return next(err);
      res.type('txt').send(data.toString());
    });
  });
  
app.route('/')
    .get(function(req, res) {
      res.sendFile(process.cwd() + '/views/index.html');
    })

app.route('/api/imagesearch/:searchQuery')
    .get((req, res) => {
      const currentDate = new Date();
      const searchQuery = req.params.searchQuery;
      const offset = parseInt(req.query.offset) || 1;
      const searchQueryURL = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=016063693745793802973:jkzqrcvuqxg&q=${searchQuery}&searchType=image&start=${offset}`;
      console.log(typeof searchQuery);

      request({uri: searchQueryURL, json: true}, (error, response, body) => {
        if (error) throw error;
        
        let searchResponse = response.body.items.map((resItem) => {
          return {url: resItem.link, snippet: resItem.snippet, thumbnail: resItem.image.thumbnailLink, context: resItem.image.contextLink};
        });
        
        connection()
          .then((client) => {
            const col = client.db(dbName).collection('queries');
            col.insertOne({term: searchQuery, when: currentDate}, (err, result) => {
              res.json(searchResponse);
            })
          })
          .catch(console.error.bind(console));
      })
    });

app.route('/api/latest/imagesearch')
  .get((req, res) => {
    connection()
      .then((client) => {
        const col = client.db(dbName).collection('queries');
        col.find({}, {limit: 10, projection: {term: 1, when: 1, _id: 0}}).toArray((error, result) => {
          if (error) throw error;
          res.json(result);
        });
      })
      .catch(console.error.bind(console));
  })

// Respond not found to all the wrong routes
app.use(function(req, res, next){
  res.status(404);
  res.type('txt').send('Not found');
});

// Error Middleware
app.use(function(err, req, res, next) {
  if(err) {
    res.status(err.status || 500)
      .type('txt')
      .send(err.message || 'SERVER ERROR');
  }  
})

app.listen(port, function () {
  console.log('Node.js listening ...');
});
