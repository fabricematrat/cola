(function (define) {
define(function(require) {
"use strict";

	var SortedMap, classList, NodeAdapter,
		defaultIdAttribute, defaultTemplateSelector, listElementsSelector,
		colaListBindingStates, undef;

	SortedMap = require('../SortedMap');
	classList = require('./classList');
	NodeAdapter = require('./NodeAdapter');

	defaultTemplateSelector = '[data-cola-role="item-template"]';
	defaultIdAttribute = 'data-cola-id';
	listElementsSelector = 'tr,li';

	colaListBindingStates = {
		empty: 'cola-list-empty',
		bound: 'cola-list-bound',
		unbound: 'cola-list-unbound'
	};

	/**
	 * Manages a collection of dom trees that are synced with a data
	 * collection.
	 * @constructor
	 * @param rootNode {Node} node to serve as a template for items
	 * in the collection / list.
	 * @param options.comparator {Function} comparator function to use for
	 *  ordering nodes
	 * @param [options.containerNode] {Node} optional parent to all itemNodes. If
	 * omitted, the parent of rootNode is assumed to be containerNode.
	 * @param [options.querySelector] {Function} DOM query function
	 * @param [options.itemTemplateSelector] {String}
	 * @param [options.idAttribute] {String}
	 * @param [options.containerAttribute] {String}
	 */
	function NodeListAdapter (rootNode, options) {
		var container, self;

		if(!options) options = {};

		this._options = options;

		this.comparator = options.comparator;
		this.identifier = options.identifier;

		this._rootNode = rootNode;

		// 1. find templateNode
		this._templateNode = findTemplateNode(rootNode, options);

		// 2. get containerNode
		// TODO: should we get the container node just-in-time?
		container = options.containerNode || this._templateNode.parentNode;

		if (!container) {
			throw new Error('No container node found for NodeListAdapter.');
		}

		this._containerNode = container;

		this._initTemplateNode();

		// keep track of itemCount, so we can set the cola-list-XXX state
		this._itemCount = undef;
		this._checkBoundState();

		self = this;
		// list of sorted data items, nodes, and unwatch functions
		this._itemData = new SortedMap(
			function(item) {
				return self.identifier(item);
			},
			function (a, b) {
				return self.comparator(a, b)
			}
		);

		this._itemsById = new SortedMap(
			function(key) { return key; }
		);

	}

	NodeListAdapter.prototype = {

		add: function (item) {
			var adapter, index;

			// create adapter
			adapter = this._createNodeAdapter(item);

			// add to map
			index = this._itemData.add(item, adapter);

			// figure out where to insert into dom
			if (index >= 0) {
				this._itemCount++;
				// insert
				this._insertNodeAt(adapter._rootNode, index);

				this._itemsById.add(this.identifier(item), item);
			}
		},

		remove: function (item) {
			var adapter, node;

			// grab node we're about to remove
			adapter = this._itemData.get(item);

			// remove item
			this._itemData.remove(item);

			if (adapter) {
				this._itemCount--;
				node = adapter._rootNode;
				adapter.destroy();
				// remove from dom
				node.parentNode.removeChild(node);

				this._itemsById.remove(this.identifier(item));
			}
		},

		update: function (item) {
			var adapter, index, key;

			adapter = this._itemData.get(item);

			if (!adapter) {
				// create adapter
				adapter = this._createNodeAdapter(item);
			}
			else {
				this._updating = adapter;
				try {
					adapter.update(item);
				}
				finally {
					delete this._updating;
				}
			}

			this._itemData.remove(item);
			index = this._itemData.add(item, adapter);

			key = this.identifier(item);
			this._itemsById.remove(key);
			this._itemsById.add(key, item);

			this._insertNodeAt(adapter._rootNode, index);
		},

		forEach: function (lambda) {
			this._itemData.forEach(lambda);
		},

		setComparator: function (comparator) {
			var i = 0, self = this;
			this.comparator = comparator;
			this._itemData.setComparator(comparator);
			this._itemData.forEach(function (adapter, item) {
				self._insertNodeAt(adapter._rootNode, i++);
			});
		},

		getOptions: function () {
			return this._options;
		},

		getItemForEvent: function (e) {
			var node, idAttr, id;

			// start at e.target and work up
			// Note: this method assumes the event object has been normalized
			node = e.target;
			idAttr = this._options.idAttribute || defaultIdAttribute;

			do id = node.getAttribute(idAttr);
			while (id == null && (node = node.parentNode) && node.nodeType == 1);

			return id != null && this._itemsById.get(id);
		},

		/**
		 * Compares two data items.  Works just like the comparator function
		 * for Array.prototype.sort. This comparator is used to sort the
		 * items in the list.
		 * This property should be injected.  If not supplied, the list
		 * will rely on one assigned by cola.
		 * @param a {Object}
		 * @param b {Object}
		 * @returns {Number} -1, 0, 1
		 */
		comparator: undef,

		identifier: undef,

		destroy: function () {
			this._itemData.forEach(function (adapter) {
				adapter.destroy();
			});
		},

		_initTemplateNode: function () {
			var templateNode = this._templateNode;
			// remove from document
			if (templateNode.parentNode) {
				templateNode.parentNode.removeChild(templateNode);
			}
			// remove any styling to hide template node (ideally, devs
			// would use a css class for this, but whatevs)
			// css class: .cola-list-unbound .my-template-node { display: none }
			if (templateNode.style.display) {
				templateNode.style.display = '';
			}
			// remove id because we're going to duplicate
			if (templateNode.id) {
				templateNode.id = '';
			}
		},

		_createNodeAdapter: function (item) {
			var node, adapter, idAttr, origUpdate, self;

			// create NodeAdapter
			node = this._templateNode.cloneNode(true);
			adapter = new NodeAdapter(node, this._options);
			adapter.update(item);

			// label node for quick identification from events
			if (this.identifier) {
				idAttr = this._options.idAttribute || defaultIdAttribute;
				adapter._rootNode.setAttribute(idAttr, this.identifier(item));
			}

			// override update() method to call back
			origUpdate = adapter.update;
			self = this;
			adapter.update = function (item) {
				// update node(s) in NodeAdapter
				origUpdate.call(adapter, item);
				// cascade to us if we didn't initiate update()
				if (self._updating != adapter) {
					self.update(item);
				}
			};

			return adapter;
		},

		_insertNodeAt: function (node, index) {
			var parent, refNode;
			parent = this._containerNode;
			refNode = parent.childNodes[index];
			// Firefox cries when you try to insert before yourself
			// which can happen if we're moving into the same position.
			if (node != refNode) {
				parent.insertBefore(node, refNode);
			}
		},

		_checkBoundState: function () {
			var state, isBound, isEmpty;
			state = {};
			isBound = this._itemCount != null;
			isEmpty = this._itemCount == 0;
			state[colaListBindingStates.unbound] = !isBound;
			state[colaListBindingStates.empty] = isEmpty;
			state[colaListBindingStates.bound] = isBound && !isEmpty;
			classList.setClassSet(this._rootNode, state);
		}

	};

	NodeListAdapter.canHandle = function (obj) {
		// crude test if an object is a node.
		return obj && obj.tagName && obj.insertBefore && obj.removeChild;
	};

	function findTemplateNode (root, options) {
		var useBestGuess, node;

		// user gave no explicit instructions
		useBestGuess = !options.itemTemplateSelector;

		if (options.querySelector) {
			// if no selector, try default selector
			node = options.querySelector(options.itemTemplateSelector || defaultTemplateSelector, root);
			// if still not found, search around for a list element
			if (!node && useBestGuess) {
				node = options.querySelector(listElementsSelector, root);
			}
		}
		if (!node && useBestGuess) {
			node = root.firstChild;
		}
		// if still not found, throw
		if (!node) {
			throw new Error('NodeListAdapter: could not find itemTemplate node');
		}
		return node;
	}

	function noop () {}

	return NodeListAdapter;

});
}(
	typeof define == 'function'
		? define
		: function (factory) { module.exports = factory(require); }
));