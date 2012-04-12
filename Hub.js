(function (define) {
define(function (require) {
"use strict";

	var eventNames, colaIdAttr,
		beforePhase, propagatingPhase, afterPhase, canceledPhase,
		resolver, addPropertyTransforms, simpleStrategy,
		undef;

	// TODO: make these configurable/extensible
	eventNames = {
		// collection item events
		add: 1,
		remove: 1,
		update: 1,
		target: 1,
		// edit mode events
		edit: 1,
		cancel: 1,
		save: 1,
		// multi-item events
		select: 1,
		unselect: 1,
		// network-level events
		join: 1,
		sync: 1,
		leave: 1
	};

	colaIdAttr = 'data-cola-id';

	/**
	 * Signal that event has not yet been pushed onto the network.
	 * Return false to prevent the event from being pushed.
	 */
	beforePhase = {};

	/**
	 * Signal that event is currently being propagated to adapters.
	 */
	propagatingPhase = {};

	/**
	 * Signal that an event has already been pushed onto the network.
	 * Return value is ignored since the event has already propagated.
	 */
	afterPhase = {};

	/**
	 * Signal that an event was canceled and not pushed onto the network.
	 * Return value is ignored since the event has already propagated.
	 */
	canceledPhase = {};

	resolver = require('./AdapterResolver');
	addPropertyTransforms = require('./addPropertyTransforms');
	simpleStrategy = require('./network/strategy/default');

	/**
	 * @constructor
	 * @param primary {Object} primary data source
	 * @param options.strategy {strategyFunction} a strategy
	 * Strategies determine if an event gets onto the network and then how
	 * it's processed by the other adapters in the network.
	 * Only one strategy can be applied to a network. However, strategies
	 * can be composed/combined.
	 */
	function Hub (primary, options) {
		var adapters, eventQueue, strategy, publicApi;

		// all adapters in network
		adapters = [];

		// events to be processed (fifo)
		eventQueue = [];

		strategy = options.strategy;
		if (!strategy) strategy = simpleStrategy;

		// create public api
		publicApi = {
			addSource: addSource,
			destroy: destroy
		};

		// add standard events to publicApi
		addApiMethods(eventNames);

		// create adapter for primary and add it
		addSource(primary, options);

		return publicApi;

		/**
		 * @memberOf Hub
		 * @param source
		 * @param options {Object}
		 * @param [options.eventNames] {Function} function that returns a
		 *   list of method names that should be considered events
		 *   If omitted, all methods, the standard event names are used.
		 * @param options.sync {Boolean} if true, initiates a 'sync' event
		 *   from this source's adapter
		 */
		function addSource (source, options) {
			var Adapter, adapter, method, eventFinder;

			if (!options) options = {};

			// create an adapter for this source
			// if we can't find an Adapter constructor, it is assumed to be an
			// adapter already.
			// TODO: revisit this assumption?
			Adapter = resolver(source);
			adapter = Adapter ? new Adapter(source, options) : source;
			if (options.bindings) {
				adapter = addPropertyTransforms(adapter, collectPropertyTransforms(options.bindings));
			}

			// sniff for event hooks
			eventFinder = configureEventFinder(options.eventNames);

			// override methods
			for (method in adapter) {
				if (typeof adapter[method] == 'function') {
					if (eventFinder(method)) {
						observeMethod(adapter, method, adapter[method]);
						addApiMethod(method, source);
					}
				}
			}

			adapters.push(adapter);
		}

		function queueEvent (source, data, type) {
			var queueNeedsRestart;

			// if queue length is zero, we need to start processing it again
			queueNeedsRestart = eventQueue.length == 0;

			// enqueue event
			eventQueue.push({ source: source, data: data, type: type });

			// start processing, if necessary
			if (queueNeedsRestart) processNextEvent();
		}

		function processNextEvent () {
			var event;

			// get the next event, if any
			event = eventQueue.shift();

			// if there was an event, process it
			if (event) {
				processEvent(event.source, event.data, event.type);
			}
		}

		function processEvent (source, data, type) {
			var context, strategyApi, i, adapter, canceled;

			context = { phase: beforePhase };
			strategyApi = createStrategyApi(context);

			canceled = false === strategy(source, undef, data, type, strategyApi);
			i = adapters.length;

			context.phase = propagatingPhase;
			while (!canceled && (adapter = adapters[--i])) {
				if (false === strategy(source, adapter, data, type, strategyApi)) {
					break;
				}
			}

			context.phase = canceled ? canceledPhase : afterPhase;
			strategy(source, undef, data, type, strategyApi);

			processNextEvent();
		}

		function createStrategyApi (context) {
			function isPhase (phase) { return context.phase == phase; }
			return {
				queueEvent: queueEvent,
				isBefore: function () { return isPhase(beforePhase); },
				isAfter: function () { return isPhase(afterPhase); },
				isCanceled: function () { return isPhase(canceledPhase); },
				isPropagating: function () { return isPhase(propagatingPhase); }
			};
		}

		function observeMethod (adapter, type, origEvent) {
			return adapter[type] = function (data) {
				// TODO: use when (or callback) to ensure origEvent is called after queued event is executed
				// Note: current implementation ensures that the queue is emptied sync, not async
				queueEvent(adapter, data, type);
				return origEvent.call(adapter, data);
			};
		}

		function addApiMethods (eventNames) {
			for (var name in eventNames) {
				addApiMethod(name);
			}
		}

		function addApiMethod (name, source) {
			if (!publicApi[name]) {
				publicApi[name] = function (itemOrDomEvent) {
					var data;
					data = convertFromDomEvent(itemOrDomEvent, primary);
					queueEvent(source, data, name);
				};
			}
		}

		function destroy () {
			var adapter;
			while ((adapter = adapters.pop())) {
				if (typeof adapter.destroy == 'function') {
					adapter.destroy();
				}
			}
		}

	}

	// TODO: get rid of this mess
	resolver.register(require('./ArrayAdapter'), 'collection');
	resolver.register(require('./dom/NodeListAdapter'), 'collection');
	resolver.register(require('./ResultSetAdapter'), 'collection');
	resolver.register(require('./QueryAdapter'), 'collection');
	resolver.register(require('./dom/NodeAdapter'), 'object');
	resolver.register(require('./ObjectAdapter'), 'object');
	resolver.register(require('./ResultAdapter'), 'object');

	return Hub;

	/**
	 * Signature for all network strategy functions.
	 * @param source {Object} the adapter that sourced the event
	 * @param dest {Object} the adapter receiving the event
	 * @param data {Object} any data associated with the event
	 * @param type {String} the type of event
	 * @param api {Object} helpful functions for strategies
	 * @returns {Boolean} whether event is allowed.
	 */
	function strategyFunction (source, dest, data, type, api) {};

	function configureEventFinder (option) {
		if (typeof option == 'function') return option;

		return function (name) { return eventNames.hasOwnProperty(name); };
	}

	function convertFromDomEvent (obj, adapter) {
		var node, id;
		// HACK: feature detection
		if (obj.target && obj.stopPropagation && obj.preventDefault) {
			obj = undef;
			// walk dom, find id, return item with same identifier
			node = obj.target;
			while (node && !node.hasAttribute(colaIdAttr)) {
				node = node.parentNode;
				if (node.nodeType != 1) node = undef;
			}
			if (node) {
				id = node.getAttribute(colaIdAttr);
				adapter.forEach(function (item) {
					if (adapter.identifier(item) == id) obj = item;
				});
			}
			if (!obj) {
				var err = new Error('Hub: could not find data item for dom event.');
				err.event = obj; // TODO: is this helpful?
				throw err;
			}
		}
		return obj;
	}

	function collectPropertyTransforms (bindings) {
		var name, propertyTransforms, transform;

		propertyTransforms = {};
		for (name in bindings) {
			transform = bindings[name].transform;
			if (transform) {
				propertyTransforms[name] = transform;
			}
		}

		return propertyTransforms;
	}

});
}(
	typeof define == 'function' && define.amd
		? define
		: function (factory) { module.exports = factory(require); }
));
