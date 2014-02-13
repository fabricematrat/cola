//var JsonPatch = require('cola/data/JsonPatch');
var JsonPatchWS = require('cola/data/JsonPatchWS');
//var LocalStorage = require('cola/data/LocalStorage');
var todosController = require('./todosController');
var Buffer = require('buffer');

function deserialize(buffer) {
  var arr = Buffer.Buffer(new Uint8Array(buffer)).toString('utf-8').split(':');
  return { complete: arr[0], description: arr[1] };
}
function serialize(item) { 
  var buffer = Buffer.Buffer(item.complete + ':' + item.description, 'utf-8');
  return new Uint8Array(buffer).buffer;
}

function equals(item1, item2) {
	return item1.description === item2.description;
}

module.exports = {
	todosController: todosController,
//	todosModel: [] // plain array
//	todosModel: new LocalStorage('todos', []) // LocalStorage
//	todosModel: new JsonPatch('/todos') // JsonPatch endpoint
	todosModel: new JsonPatchWS('ws://localhost:8080/', serialize, deserialize, equals) // JsonPatch websocket
};



