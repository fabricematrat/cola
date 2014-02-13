#!/usr/bin/env node

var WebSocketServer = require('ws').Server;
var Memory = require('./data/Memory');
var jsonPatch = require('./lib/jsonPatch');

var todos = new Memory([]);

var clientId = 1;
var clients = {};

var http = require('http');
var express = require('express');

var app = express.createServer();

app.use(express.static(__dirname));
app.listen(8080);
var server = new WebSocketServer({server: app});

var wholeSaleTransfer = false;

server.on('connection', function(ws) {
	var id = clientId++;
	var client = clients[id] = new ClientProxy(ws, id);
	console.log('connected', id);

	client.set(todos.get());

	ws.on('message', function(message) {
		var patch = JSON.parse(message);
		if(!patch.patch) {
			console.log('no patch info');
			return;
		}

		patch = patch.patch;

		process.nextTick(function() {
			client._shadow = jsonPatch.patch(patch, client._shadow);
			todos.patch(patch);

			var returnPatch = todos.diff(client._shadow);
			client.patch(returnPatch);

			if(patch && patch.length > 0) {
				Object.keys(clients).forEach(function(clientId) {
					if(clientId != id) {
						var c = clients[clientId];
						var returnPatch = jsonPatch.diff(c._shadow, todos._shadow);
						c.patch(returnPatch);
					}
				});
			}
		});
	});

	ws.on('close', function() {
		console.log('disconnected', id);
		delete clients[id];
	});
});

function serialize(item) {
  var buffer = new Buffer(item.complete + ':' + item.description, 'utf-8');
  return new Uint8Array(buffer).buffer;
}

var summarizer = require('mathsync').summarizer.fromItems(todos.get() || [], serialize);

app.get('/summary', function(req,res) {
	var level = req.query.level;
	console.log(level);
	summarizer(level | 0).then(function(diff) {
		//console.log(diff);
		res.send(diff);
	});
});


function ClientProxy(client, id) {
	this.client = client;
	this.id = id;
}

ClientProxy.prototype = {
	set: function(data) {
		this._shadow = jsonPatch.snapshot(data);
		if(wholeSaleTransfer) {
			this.client.send(JSON.stringify({ data: data }));
		} else {
			this.client.send(JSON.stringify({ data: 'sync' }));
		}
	},

	diff: function(data) {
		return jsonPatch.diff(data, this._shadow);
	},

	patch: function(patch) {
		if(!patch || patch.length === 0) {
			return;
		}

		try {
			this._shadow = jsonPatch.patch(patch, this._shadow);
			this.send(patch);
		} catch(e) {
			console.error(e.stack);
		}
	},

	send: function(patch) {
		this.client.send(JSON.stringify({ patch: patch }));
	}
};

