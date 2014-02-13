/** @license MIT License (c) copyright 2010-2013 original author or authors */

/**
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * @author: Brian Cavalier
 * @author: John Hann
 */

(function(define) { 'use strict';
define(function(require) {

	var ms = require('mathsync');
	var Buffer = require('buffer');

	function MathDiff(url, serialize, deserialize, equals) {
		this._url = url;
		this._serialize = serialize;
		this._deserialize = deserialize;
		this._equals = equals;
	}


	// server diff retrieval quick and dirty
	function fetchSummary(level) {
		var xhrq = new XMLHttpRequest();
		xhrq.open('GET', '/summary/?level=' + level, false);
		xhrq.send(null);
		var response = xhrq.responseText;
		console.log("diff level " + level);
		return JSON.parse(response);
	}

	MathDiff.prototype = {
		sync : function(shadow, jsonPatch, resolve) {
			shadow._shadow = shadow._shadow || [];

			var local = ms.summarizer.fromItems(shadow._shadow, this._serialize);
			var remote = ms.summarizer.fromJSON(fetchSummary);

			var resolveDiff = ms.resolver.fromSummarizers(local, remote, this._deserialize);

			var data = shadow._shadow;
			var self = this;

			resolveDiff().then(function (difference) { 
				if(difference.added.length != 0 || difference.removed.length != 0) {
					var i,j;
					for (i = 0; i <  data.length; i+=1) {			
						for (j = 0; j < difference.removed.length; ++j) {
							if(self._equals(data[i], difference.removed[j])) {
								data.splice(i, 1);
								i--;
								break;
							} 
						}
					}
					difference.added.forEach(function(item) {
						data.push(item);
					});
				} else {
					data = [];0
				}
				resolve(jsonPatch.snapshot(data));
			});
		}
	};

	return MathDiff;

});
}(typeof define === 'function' && define.amd ? define : function(factory) { module.exports = factory(require); }));
