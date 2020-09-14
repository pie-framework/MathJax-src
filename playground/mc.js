/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements functions for handling option lists
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */


/*****************************************************************/
/* tslint:disable-next-line:jsdoc-require */
const OBJECT = {}.constructor;

/**
 *  Check if an object is an object literal (as opposed to an instance of a class)
 */
function isObject(obj) {
  return typeof obj === 'object' && obj !== null &&
    (obj.constructor === OBJECT || obj.constructor === Expandable);
}

/*****************************************************************/
/**
 * Generic list of options
 */


/*****************************************************************/
/**
 *  Used to append an array to an array in default options
 *  E.g., an option of the form
 *
 *    {
 *      name: {[APPEND]: [1, 2, 3]}
 *    }
 *
 *  where 'name' is an array in the default options would end up with name having its
 *  original value with 1, 2, and 3 appended.
 */
const APPEND = '[+]';

/**
 *  Used to remove elements from an array in default options
 *  E.g., an option of the form
 *
 *    {
 *      name: {[REMOVE]: [2]}
 *    }
 *
 *  where 'name' is an array in the default options would end up with name having its
 *  original value but with any entry of 2 removed  So if the original value was [1, 2, 3, 2],
 *  then the final value will be [1, 3] instead.
 */
const REMOVE = '[-]';

/**
 * A Class to use for options that should not produce warnings if an undefined key is used
 */
class Expandable {}

/**
 * Produces an instance of Expandable with the given values (to be used in defining options
 * that can use keys that don't have default values).  E.g., default options of the form:
 *
 *  OPTIONS = {
 *     types: expandable({
 *       a: 1,
 *       b: 2
 *     })
 *  }
 *
 *  would allow user options of
 *
 *  {
 *     types: {
 *       c: 3
 *     }
 *  }
 *
 *  without reporting an error.
 */
function expandable(def) {
  return Object.assign(Object.create(Expandable.prototype), def);
}

/*****************************************************************/
/**
 *  Make sure an option is an Array
 */
function makeArray(x) {
  return Array.isArray(x) ? x : [x];
}

/*****************************************************************/
/**
 * Get all keys and symbols from an object
 *
 * @param {Optionlist} def        The object whose keys are to be returned
 * @return {(string | symbol)[]}  The list of keys for the object
 */
function keys(def) {
  if (!def) {
    return [];
  }
  return (Object.keys(def) ).concat(Object.getOwnPropertySymbols(def));
}

/*****************************************************************/
/**
 * Make a deep copy of an object
 *
 * @param {OptionList} def  The object to be copied
 * @return {OptionList}     The copy of the object
 */
function copy(def) {
  let props = {};
  for (const key of keys(def)) {
    let prop = Object.getOwnPropertyDescriptor(def, key);
    let value = prop.value;
    if (Array.isArray(value)) {
      prop.value = insert([], value, false);
    } else if (isObject(value)) {
      prop.value = copy(value);
    }
    if (prop.enumerable) {
      props[key ] = prop;
    }
  }
  return Object.defineProperties(def.constructor === Expandable ? expandable({}) : {}, props);
}

/*****************************************************************/
/**
 * Insert one object into another (with optional warnings about
 * keys that aren't in the original)
 *
 * @param {OptionList} dst  The option list to merge into
 * @param {OptionList} src  The options to be merged
 * @param {boolean} warn    True if a warning should be issued for a src option that isn't already in dst
 * @return {OptionList}     The modified destination option list (dst)
 */
function insert(dst, src, warn = true) {
  for (let key of keys(src) ) {
    //
    // Check if the key is valid (i.e., is in the defaults or in an expandable block)
    //
    if (warn && dst[key] === undefined && dst.constructor !== Expandable) {
      if (typeof key === 'symbol') {
        key = (key ).toString();
      }
      throw new Error('Invalid option "' + key + '" (no default value).');
    }
    //
    // Shorthands for the source and destination values
    //
    let sval = src[key], dval = dst[key];
    //
    // If the source is an object literal and the destination exists and is either an
    //   object or a function (so can have properties added to it)...
    //
    if (isObject(sval) && dval !== null &&
        (typeof dval === 'object' || typeof dval === 'function')) {
      const ids = keys(sval);
      //
      // Check for APPEND or REMOVE objects:
      //
      if (
        //
        // If the destination value is an array...
        //
        Array.isArray(dval) &&
          (
            //
            // If there is only one key and it is APPEND or REMOVE and the keys value is an array...
            //
            (ids.length === 1 && (ids[0] === APPEND || ids[0] === REMOVE) && Array.isArray(sval[ids[0]])) ||
              //
              // Or if there are two keys and they are APPEND and REMOVE and both keys' values
              //   are arrays...
              //
              (ids.length === 2 && ids.sort().join(',') === APPEND + ',' + REMOVE &&
               Array.isArray(sval[APPEND]) && Array.isArray(sval[REMOVE]))
          )
      ) {
        //
        // Then remove any values to be removed
        //
        if (sval[REMOVE]) {
          dval = dst[key] = dval.filter(x => sval[REMOVE].indexOf(x) < 0);
        }
        //
        // And append any values to be added (make a copy so as not to modify the original)
        //
        if (sval[APPEND]) {
          dst[key] = [...dval, ...sval[APPEND]];
        }
      } else {
        //
        // Otherwise insert the values of the source object into the destination object
        //
        insert(dval, sval, warn);
      }
    } else if (Array.isArray(sval)) {
      //
      // If the source is an array, replace the destination with an empty array
      //   and copy the source values into it.
      //
      dst[key] = [];
      insert(dst[key], sval, false);
    } else if (isObject(sval)) {
      //
      // If the source is an object literal, set the destination to a copy of it
      //
      dst[key] = copy(sval);
    } else {
      //
      // Otherwise set the destination to the source value
      //
      dst[key] = sval;
    }
  }
  return dst;
}

/*****************************************************************/
/**
 * Merge options without warnings (so we can add new default values into an
 * existing default list)
 *
 * @param {OptionList} options  The option list to be merged into
 * @param {OptionList[]} defs   The option lists to merge into the first one
 * @return {OptionList}         The modified options list
 */
function defaultOptions(options, ...defs) {
  defs.forEach(def => insert(options, def, false));
  return options;
}

/*****************************************************************/
/**
 * Merge options with warnings about undefined ones (so we can merge
 * user options into the default list)
 *
 * @param {OptionList} options  The option list to be merged into
 * @param {OptionList[]} defs   The option lists to merge into the first one
 * @return {OptionList}         The modified options list
 */
function userOptions(options, ...defs) {
  defs.forEach(def => insert(options, def, true));
  return options;
}

/*****************************************************************/
/**
 *  Separate options into sets: the ones having the same keys
 *  as the second object, the third object, etc, and the ones that don't.
 *  (Used to separate an option list into the options needed for several
 *   subobjects.)
 *
 * @param {OptionList} options    The option list to be split into parts
 * @param {OptionList[]} objects  The list of option lists whose keys are used to break up
 *                                 the original options into separate pieces.
 * @return {OptionList[]}         The option lists taken from the original based on the
 *                                 keys of the other objects.  The first one in the list
 *                                 consists of the values not appearing in any of the others
 *                                 (i.e., whose keys were not in any of the others).
 */
function separateOptions(options, ...objects) {
  let results = [];
  for (const object of objects) {
    let exists = {}, missing = {};
    for (const key of Object.keys(options || {})) {
      (object[key] === undefined ? missing : exists)[key] = options[key];
    }
    results.push(exists);
    options = missing;
  }
  results.unshift(options);
  return results;
}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements a list sorted by a numeric priority
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

/*****************************************************************/
/**
 *  The PrioritizedListItem<DataClass> interface
 *
 * @template DataClass   The class of data stored in the item
 */














/*****************************************************************/
/**
 *  Implements the PrioritizedList<DataClass> class
 *
 * @template DataClass   The class of data stored in the list
 */

class PrioritizedList {

  /**
   * The default priority for items added to the list
   */
   static __initStatic() {this.DEFAULTPRIORITY = 5;}

  /**
   * The list of items, sorted by priority (smallest number first)
   */
   __init() {this.items = [];}

  /**
   * @constructor
   */
  constructor() {PrioritizedList.prototype.__init.call(this);
    this.items = [];
  }

  /**
   * Make the list iterable, and return the data for the items in the list
   *
   * @return {{next: Function}}  The object containing the iterator's next() function
   */
   [Symbol.iterator]() {
    let i = 0;
    let items = this.items;
    return {
      /* tslint:disable-next-line:jsdoc-require */
      next() {
        return {value: items[i++], done: (i > items.length)};
      }
    };
  }

  /**
   * Add an item to the list
   *
   * @param {DataClass} item   The data for the item to be added
   * @param {number} priority  The priority for the item
   * @return {DataClass}       The data itself
   */
   add(item, priority = PrioritizedList.DEFAULTPRIORITY) {
    let i = this.items.length;
    do {
      i--;
    } while (i >= 0 && priority < this.items[i].priority);
    this.items.splice(i + 1, 0, {item: item, priority: priority});
    return item;
  }

  /**
   * Remove an item from the list
   *
   * @param {DataClass} item   The data for the item to be removed
   */
   remove(item) {
    let i = this.items.length;
    do {
      i--;
    } while (i >= 0 && this.items[i].item !== item);
    if (i >= 0) {
      this.items.splice(i, 1);
    }
  }

  /**
   * Typescript < 2.3 targeted at ES5 doesn't handle
   *
   *     for (const x of this) {...}
   *
   * so use toArray() to convert to array, when needed
   *
   * @return {PrioritizedListItem<DataClass>[]}  The list converted to an array
   */
   toArray() {
    return Array.from(this);
  }

} PrioritizedList.__initStatic();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 *  The FunctionListItem interface (extends PrioritizedListItem<Function>)
 */



/*****************************************************************/
/**
 *  Implements the FunctionList class (extends PrioritizedList<Function>)
 */

class FunctionList extends PrioritizedList {

  /**
   * Executes the functions in the list (in prioritized order),
   *   passing the given data to the functions.  If any return
   *   false, the list is terminated.
   *
   * @param {any[]} data  The array of arguments to pass to the functions
   * @return {boolean}    False if any function stopped the list by
   *                       returning false, true otherwise
   */
   execute(...data) {
    for (const item of this) {
      let result = item.item(...data);
      if (result === false) {
        return false;
      }
    }
    return true;
  }

  /**
   * Executes the functions in the list (in prioritized order) asynchronously,
   *   passing the given data to the functions, and doing the next function
   *   only when the previous one completes.  If the function returns a
   *   Promise, then use that to control the flow.  Otherwise, if the
   *   function returns false, the list is terminated.
   * This function returns a Promise.  If any function in the list fails,
   *   the promise fails.  If any function returns false, the promise
   *   succeeds, but passes false as its argument.  Otherwise it succeeds
   *   and passes true.
   *
   * @param {any[]} data  The array of arguments to pass to the functions
   * @return {Promise}    The promise that is satisfied when the function
   *                       list completes (with argument true or false
   *                       depending on whether some function returned
   *                       false or not).
   */
   asyncExecute(...data) {
    let i = -1;
    let items = this.items;
    return new Promise((ok, fail) => {
      (function execute() {
        while (++i < items.length) {
          let result = items[i].item(...data);
          if (result instanceof Promise) {
            result.then(execute).catch(err => fail(err));
            return;
          }
          if (result === false) {
            ok(false);
            return;
          }
        }
        ok(true);
      })();
    });
  }

}

/*****************************************************************/
/**
 *  The InputJax interface
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */




































































/*****************************************************************/
/**
 *  The abstract InputJax class
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class AbstractInputJax {

  /**
   * The name of the input jax
   */
   static __initStatic() {this.NAME = 'generic';}

  /**
   * The default options for the input jax
   */
   static __initStatic2() {this.OPTIONS = {};}

  /**
   * The actual options supplied to the input jax
   */
  

  /**
   * Filters to run on the TeX string before it is processed
   */
  

  /**
   * Filters to run on the generated MathML after the TeX string is processed
   */
  

  /**
   * The DOMAdaptor for the MathDocument for this input jax
   */
   __init() {this.adaptor = null;}  // set by the handler
  /**
   * The MathML node factory
   */
   __init2() {this.mmlFactory = null;}        // set by the handler

  /**
   * @param {OptionList} options  The options to apply to this input jax
   *
   * @constructor
   */
  constructor(options = {}) {AbstractInputJax.prototype.__init.call(this);AbstractInputJax.prototype.__init2.call(this);
    let CLASS = this.constructor ;
    this.options = userOptions(defaultOptions({}, CLASS.OPTIONS), options);
    this.preFilters = new FunctionList();
    this.postFilters = new FunctionList();
  }

  /**
   * @return {string}  The name of this input jax class
   */
   get name() {
    return (this.constructor ).NAME;
  }

  /**
   * @override
   */
   setAdaptor(adaptor) {
    this.adaptor = adaptor;
  }

  /**
   * @override
   */
   setMmlFactory(mmlFactory) {
    this.mmlFactory = mmlFactory;
  }

  /**
   * @override
   */
   initialize() {
  }

  /**
   * @return {boolean}  True means find math in string array, false means in DOM element
   */
   get processStrings() {
    return true;
  }

  /**
   * @override
   */
   findMath(_node, _options) {
    return [] ;
  }

  /**
   * @override
   */
  

  /**
   * Execute a set of filters, passing them the MathItem and any needed data,
   *  and return the (possibly modified) data
   *
   * @param {FunctionList} filters   The list of functions to be performed
   * @param {MathItem} math          The math item that is being processed
   * @param {MathDocument} document  The math document containg the math item
   * @param {any} data               Whatever other data is needed
   * @return {any}                   The (possibly modified) data
   */
   executeFilters(
    filters, math,
    document, data
  ) {
    let args = {math: math, document: document, data: data};
    filters.execute(args);
    return args.data;
  }

} AbstractInputJax.__initStatic(); AbstractInputJax.__initStatic2();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 *  The FindMath interface
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template _D  The Document class
 */

















/*****************************************************************/
/**
 *  The FindMath abstract class
 */

/**
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class AbstractFindMath {

  /**
   * The default options for FindMath
   */
   static __initStatic() {this.OPTIONS = {};}

  /**
   * The actual options for this instance
   */
  

  /**
   * @param {OptionList} options  The user options for this instance
   */
  constructor(options) {
    let CLASS = this.constructor ;
    this.options = userOptions(defaultOptions({}, CLASS.OPTIONS), options);
  }

  /**
   * Locate math in an Element or a string array;
   *
   * @param {Element | string[]} where  The node or string array to search for math
   * @return {ProtoItem[]}              The array of proto math items found
   */
  

} AbstractFindMath.__initStatic();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */




/**
 * The MathML namespace
 */
const NAMESPACE = 'http://www.w3.org/1998/Math/MathML';


/*****************************************************************/
/**
 *  Implements the FindMathML object (extends AbstractFindMath)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class FindMathML extends AbstractFindMath {

  /**
   * @override
   */
   static __initStatic() {this.OPTIONS = {};}

  /**
   * The DOMAdaptor for the document being processed
   */
  

  /**
   * Locates math nodes, possibly with namespace prefixes.
   *  Store them in a set so that if found more than once, they will only
   *  appear in the list once.
   *
   * @override
   */
   findMath(node) {
    let set = new Set();
    this.findMathNodes(node, set);
    this.findMathPrefixed(node, set);
    const html = this.adaptor.root(this.adaptor.document);
    if (this.adaptor.kind(html) === 'html' &&  set.size === 0) {
      this.findMathNS(node, set);
    }
    return this.processMath(set);
  }

  /**
   * Find plain <math> tags
   *
   * @param {N} node       The container to seaerch for math
   * @param {Set<N>} set   The set in which to store the math nodes
   */
   findMathNodes(node, set) {
    for (const math of this.adaptor.tags(node, 'math')) {
      set.add(math);
    }
  }

  /**
   * Find <m:math> tags (or whatever prefixes there are)
   *
   * @param {N} node  The container to seaerch for math
   * @param {NodeSet} set   The set in which to store the math nodes
   */
   findMathPrefixed(node, set) {
    let html = this.adaptor.root(this.adaptor.document);
    for (const attr of this.adaptor.allAttributes(html)) {
      if (attr.name.substr(0, 6) === 'xmlns:' && attr.value === NAMESPACE) {
        let prefix = attr.name.substr(6);
        for (const math of this.adaptor.tags(node, prefix + ':math')) {
          set.add(math);
        }
      }
    }
  }

  /**
   * Find namespaced math in XHTML documents (is this really needed?)
   *
   * @param {N} node  The container to seaerch for math
   * @param {NodeSet} set   The set in which to store the math nodes
   */
   findMathNS(node, set) {
    for (const math of this.adaptor.tags(node, 'math', NAMESPACE)) {
      set.add(math);
    }
  }

  /**
   *  Produce the array of proto math items from the node set
   */
   processMath(set) {
    let math = [];
    for (const mml of Array.from(set)) {
      let display = (this.adaptor.getAttribute(mml, 'display') === 'block' ||
                     this.adaptor.getAttribute(mml, 'mode') === 'display');
      let start = {node: mml, n: 0, delim: ''};
      let end   = {node: mml, n: 0, delim: ''};
      math.push({math: this.adaptor.outerHTML(mml), start, end, display});
    }
    return math;
  }

} FindMathML.__initStatic();

/**
 * A constant for when a property should be inherited from the global defaults lists
 */
const INHERIT = '_inherit_';

/******************************************************************/
/**
 * Implements the Attributes class for MmlNodes
 *  (These can be set explicitly, inherited from parent nodes,
 *   taken from a default list of values, or taken from global
 *   defaults.)
 */

class Attributes {
  /**
   * The attributes explicitly set on a node
   */
  
  /**
   * The attributes inherited from parent nodes
   */
  
  /**
   * The default attributes for the node type
   */
  
  /**
   * Global attributes from the math node itself
   */
  

  /**
   * @param {PropertyList} defaults  The defaults for this node type
   * @param {PropertyList} global    The global properties (from the math node)
   *
   * @constructor
   */
  constructor(defaults, global) {
    this.global = global;
    this.defaults = Object.create(global);
    this.inherited = Object.create(this.defaults);
    this.attributes = Object.create(this.inherited);
    Object.assign(this.defaults, defaults);
  }

  /**
   * @param {string} name     The name of the attribute to set
   * @param {Property} value  The value to give the named attribute
   */
   set(name, value) {
    this.attributes[name] = value;
  }

  /**
   * @param {PropertyList} list  An object containing the properties to set
   */
   setList(list) {
    Object.assign(this.attributes, list);
  }

  /**
   * @param {string} name  The name of the attribute whose value is to be returned
   * @return {Property}    The value of the named attribute (including inheritance and defaults)
   */
   get(name) {
    let value = this.attributes[name];
    if (value === INHERIT) {
      value = this.global[name];
    }
    return value;
  }

  /**
   * @param {string} name  The value of the attribute whose value is to be returned
   * @return {Property}    The attribute whose name was given if it is explicit on the
   *                       node (not inherited or defaulted), null otherwise
   */
   getExplicit(name) {
    if (!this.attributes.hasOwnProperty(name)) {
      return undefined;
    }
    return this.attributes[name];
  }

  /**
   * @param {string[]} names  The names of attributes whose values are to be returned
   * @return {PropertyList}   An object containing the attributes and their values
   */
   getList(...names) {
    let values = {};
    for (const name of names) {
      values[name] = this.get(name);
    }
    return values;
  }

  /**
   * @param {string} name  The name of an inherited attribute to be set
   * @param {Property} value  The value to assign to the named attribute
   */
   setInherited(name, value) {
    this.inherited[name] = value;
  }

  /**
   * @param {string} name  The name of an inherited attribute whose value is to be returned
   * @return {Property}    The value of the named attribute if it is inherited, null otherwise
   */
   getInherited(name) {
    return this.inherited[name];
  }

  /**
   * @param {string} name  The name of a default attribute whose value is to be returned
   * @return {Property}    The value of the named attribute if a default exists for it, null otherwise
   */
   getDefault(name) {
    return this.defaults[name];
  }

  /**
   * @param {string} name  The name of a attribute to check
   * @return {boolean}     True if attribute is set explicitly or inherited
   *                         from an explicit mstyle or math attribute
   */
   isSet(name) {
    return this.attributes.hasOwnProperty(name) || this.inherited.hasOwnProperty(name);
  }

  /**
   * @param {string} name  The name of an attribute to test for the existence of a default
   * @return {boolean}     True of there is a default for the named attribute, false otherwise
   */
   hasDefault(name) {
    return (name in this.defaults);
  }

  /**
   * @return {string[]}  The names of all the attributes explicitly set on the node
   */
   getExplicitNames() {
    return Object.keys(this.attributes);
  }

  /**
   * @return {string[]}  The names of all the inherited attributes for the node
   */
   getInheritedNames() {
    return Object.keys(this.inherited);
  }

  /**
   * @return {string[]}  The names of all the default attributes for the node
   */
   getDefaultNames() {
    return Object.keys(this.defaults);
  }

  /**
   * @return {string[]}  The names of all the global attributes
   */
   getGlobalNames() {
    return Object.keys(this.global);
  }

  /**
   * @return {PropertyList}  The attribute object
   */
   getAllAttributes() {
    return this.attributes;
  }

  /**
   * @return {PropertyList}  The inherited object
   */
   getAllInherited() {
    return this.inherited;
  }

  /**
   * @return {PropertyList}  The defaults object
   */
   getAllDefaults() {
    return this.defaults;
  }

  /**
   * @return {PropertyList}  The global object
   */
   getAllGlobals() {
    return this.global;
  }

}

/**
 *  PropertyList and Property are for string data like
 *  attributes and other properties
 */



































































































/*********************************************************/
/**
 *  The abstract Node class
 */

class AbstractNode  {

  /**
   * The parent node for this one
   */
   __init() {this.parent = null;}

  /**
   * The properties for this node
   */
   __init2() {this.properties = {};}

  /**
   * The NodeFactory to use to create additional nodes, as needed
   */
   __init3() {this._factory = null;}

  /**
   * The children for this node
   */
   __init4() {this.childNodes = [];}

  /**
   * @param {NodeFactory} factory  The NodeFactory to use to create new nodes when needed
   * @param {PropertyList} properties  Any properties to be added to the node, if any
   * @param {Node[]} children  The initial child nodes, if any
   *
   * @constructor
   * @implements {Node}
   */
  constructor(factory, properties = {}, children = []) {AbstractNode.prototype.__init.call(this);AbstractNode.prototype.__init2.call(this);AbstractNode.prototype.__init3.call(this);AbstractNode.prototype.__init4.call(this);
    this._factory = factory;
    for (const name of Object.keys(properties)) {
      this.setProperty(name, properties[name]);
    }
    if (children.length) {
      this.setChildren(children);
    }
  }

  /**
   * @override
   */
   get factory () {
    return this._factory;
  }

  /**
   * @override
   */
   get kind() {
    return 'unknown';
  }

  /**
   * @override
   */
   setProperty(name, value) {
    this.properties[name] = value;
  }

  /**
   * @override
   */
   getProperty(name) {
    return this.properties[name];
  }

  /**
   * @override
   */
   getPropertyNames() {
    return Object.keys(this.properties);
  }

  /**
   * @override
   */
   getAllProperties() {
    return this.properties;
  }

  /**
   * @override
   */
   removeProperty(...names) {
    for (const name of names) {
      delete this.properties[name];
    }
  }


  /**
   * @override
   */
   isKind(kind) {
    return this.factory.nodeIsKind(this, kind);
  }


  /**
   * @override
   */
   setChildren(children) {
    this.childNodes = [];
    for (let child of children) {
      this.appendChild(child);
    }
  }

  /**
   * @override
   */
   appendChild(child) {
    this.childNodes.push(child);
    child.parent = this;
    return child;
  }

  /**
   * @override
   */
   replaceChild(newChild, oldChild) {
    let i = this.childIndex(oldChild);
    // If i === null should we error?  return null?  silently fail?
    if (i !== null) {
      this.childNodes[i] = newChild;
      newChild.parent = this;
    }
    return newChild;
  }


  /**
   * @override
   */
   childIndex(node) {
    let i = this.childNodes.indexOf(node);
    return (i === -1 ? null : i);
  }


  /**
   * @override
   */
   findNodes(kind) {
    let nodes = [];
    this.walkTree((node) => {
      if (node.isKind(kind)) {
        nodes.push(node);
      }
    });
    return nodes;
  }


  /**
   * @override
   */
   walkTree(func, data) {
    func(this, data);
    for (const child of this.childNodes) {
      if (child) {
        child.walkTree(func, data);
      }
    }
    return data;
  }

  /**
   * Simple string version for debugging, just to get the structure.
   */
   toString() {
    return this.kind + '(' + this.childNodes.join(',') + ')';
  }

}

/*********************************************************/
/**
 *  The abstract EmptyNode class
 */

class AbstractEmptyNode extends AbstractNode {
  /**
   *  We don't have children, so ignore these methods
   */

  /**
   * @override
   */
   setChildren(_children) {
  }

  /**
   * @override
   */
   appendChild(child) {
    return child;
  }

  /**
   * @override
   */
   replaceChild(_newChild, oldChild) {
    return oldChild;
  }

  /**
   * @override
   */
   childIndex(_node) {
    return null ;
  }

  /**
   * Don't step into children (there aren't any)
   *
   * @override
   */
   walkTree(func, data) {
    func(this, data);
    return data;
  }

  /**
   * Simple string version for debugging, just to get the structure.
   */
   toString() {
    return this.kind;
  }

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */



/**
 *  Used in setInheritedAttributes() to pass originating node kind as well as property value
 */


/**
 *  These are the TeX classes for spacing computations
 */
const TEXCLASS = {
  ORD:   0,
  OP:    1,
  BIN:   2,
  REL:   3,
  OPEN:  4,
  CLOSE: 5,
  PUNCT: 6,
  INNER: 7,
  VCENTER: 8,  // Used in TeXAtom, but not for spacing
  NONE:   -1
};

const TEXCLASSNAMES = ['ORD', 'OP', 'BIN', 'REL', 'OPEN', 'CLOSE', 'PUNCT', 'INNER', 'VCENTER'];

/**
 *  The spacing sizes used by the TeX spacing table below.
 */
const TEXSPACELENGTH = ['', 'thinmathspace', 'mediummathspace', 'thickmathspace'];

/**
 * See TeXBook Chapter 18 (p. 170)
 */
const TEXSPACE = [
  [ 0, -1,  2,  3,  0,  0,  0,  1], // ORD
  [-1, -1,  0,  3,  0,  0,  0,  1], // OP
  [ 2,  2,  0,  0,  2,  0,  0,  2], // BIN
  [ 3,  3,  0,  0,  3,  0,  0,  3], // REL
  [ 0,  0,  0,  0,  0,  0,  0,  0], // OPEN
  [ 0, -1,  2,  3,  0,  0,  0,  1], // CLOSE
  [ 1,  1,  0,  1,  1,  1,  1,  1], // PUNCT
  [ 1, -1,  2,  3,  1,  0,  1,  1]  // INNER
];

/**
 * Attributes used to determine indentation and shifting
 */
const indentAttributes = [
  'indentalign', 'indentalignfirst',
  'indentshift', 'indentshiftfirst'
];

/**
 * The nodes that can be in the internal MathML tree
 */












































































































































/*****************************************************************/
/**
 *  The abstract MmlNode class (extends the AbstractNode class and implements
 *  the IMmlNode interface)
 */

class AbstractMmlNode extends AbstractNode  {
  /**
   * The properties common to all MathML nodes
   */
   static __initStatic() {this.defaults = {
    mathbackground: INHERIT,
    mathcolor: INHERIT,
    mathsize: INHERIT,  // technically only for token elements, but <mstyle mathsize="..."> should
    //    scale all spaces, fractions, etc.
    dir: INHERIT
  };}
  /**
   *  This lists properties that do NOT get inherited between specific kinds
   *  of nodes.  The outer keys are the node kinds that are being inherited FROM,
   *  while the second level of keys are the nodes that INHERIT the values.  Any
   *  property appearing in the innermost list is NOT inherited by the pair.
   *
   *  For example, an mpadded element will not inherit a width attribute from an mstyle node.
   */
   static __initStatic2() {this.noInherit = {
    mstyle: {
      mpadded: {width: true, height: true, depth: true, lspace: true, voffset: true},
      mtable:  {width: true, height: true, depth: true, align: true}
    },
    maligngroup: {
      mrow: {groupalign: true},
      mtable: {groupalign: true}
    }
  };}

  /**
   * This lists the attributes that should always be inherited,
   *   even when there is no default value for the attribute.
   */
   static __initStatic3() {this.alwaysInherit = {
    scriptminsize: true,
    scriptsizemultiplier: true
  };}

  /**
   * This is the list of options for the verifyTree() method
   */
   static __initStatic4() {this.verifyDefaults = {
    checkArity: true,
    checkAttributes: false,
    fullErrors: false,
    fixMmultiscripts: true,
    fixMtables: true
  };}

  /*
   * These default to being unset (the node doesn't participate in spacing calculations).
   * The correct values are produced when the setTeXclass() method is called on the tree.
   */

  /**
   * The TeX class for this node
   */
   __init() {this.texClass = null;}
  /**
   * The TeX class for the preceding node
   */
   __init2() {this.prevClass = null;}
  /**
   * The scriptlevel of the preceding node
   */
   __init3() {this.prevLevel = null;}

  /**
   * This node's attributes
   */
  

  /**
   *  Child nodes are MmlNodes (special case of Nodes).
   */
  
  /**
   * The parent is an MmlNode
   */
  
  /**
   * The node factory is an MmlFactory
   */
  

  /**
   *  Create an MmlNode:
   *    If the arity is -1, add the inferred row (created by the factory)
   *    Add the children, if any
   *    Create the Attribute object from the class defaults and the global defaults (the math node defaults)
   *
   *  @override
   */
  constructor(factory, attributes = {}, children = []) {
    super(factory);AbstractMmlNode.prototype.__init.call(this);AbstractMmlNode.prototype.__init2.call(this);AbstractMmlNode.prototype.__init3.call(this);    if (this.arity < 0) {
      this.childNodes = [factory.create('inferredMrow')];
      this.childNodes[0].parent = this;
    }
    this.setChildren(children);
    this.attributes = new Attributes(
      factory.getNodeClass(this.kind).defaults,
      factory.getNodeClass('math').defaults
    );
    this.attributes.setList(attributes);
  }

  /**
   * @return {boolean}  true if this is a token node
   */
   get isToken() {
    return false;
  }

  /**
   * @return {boolean}  true if this is an embellished operator
   */
   get isEmbellished() {
    return false;
  }

  /**
   * @return {boolean}  true if this is a space-like node
   */
   get isSpacelike() {
    return false;
  }

  /**
   * @return {boolean}  true if this is a node that supports linebreaks in its children
   */
   get linebreakContainer() {
    return false;
  }

  /**
   * @return {boolean}  true if this node contains a line break
   */
   get hasNewLine() {
    return false;
  }

  /**
   * @return {number}  The number of children allowed, or Infinity for any number,
   *                   or -1 for when an inferred row is needed for the children.
   *                   Special case is 1, meaning at least one (other numbers
   *                   mean exactly that many).
   */
   get arity() {
    return Infinity;
  }

  /**
   * @return {boolean}  true if this is an inferred mrow
   */
   get isInferred() {
    return false;
  }

  /**
   * @return {MmlNode}  The logical parent of this node (skipping over inferred rows
   *                      some other node types)
   */
   get Parent() {
    let parent = this.parent;
    while (parent && parent.notParent) {
      parent = parent.Parent;
    }
    return parent;
  }

  /**
   * @return {boolean}  true if this is a node that doesn't count as a parent node in Parent()
   */
   get notParent() {
    return false;
  }

  /**
   * If there is an inferred row, the the children of that instead
   *
   * @override
   */
   setChildren(children) {
    if (this.arity < 0) {
      return this.childNodes[0].setChildren(children);
    }
    return super.setChildren(children);
  }
  /**
   * If there is an inferred row, append to that instead
   *
   * @override
   */
   appendChild(child) {
    if (this.arity < 0) {
      this.childNodes[0].appendChild(child);
      return child;
    }
    return super.appendChild(child);
  }
  /**
   * If there is an inferred row, remove the child from there
   *
   * @override
   */
   replaceChild(newChild, oldChild) {
    if (this.arity < 0) {
      this.childNodes[0].replaceChild(newChild, oldChild);
      return newChild;
    }
    return super.replaceChild(newChild, oldChild);
  }

  /**
   * @override
   */
   core() {
    return this;
  }

  /**
   * @override
   */
   coreMO() {
    return this;
  }

  /**
   * @override
   */
   coreIndex() {
    return 0;
  }

  /**
   * @override
   */
   childPosition() {
    let child = this;
    let parent = child.parent;
    while (parent && parent.notParent) {
      child = parent;
      parent = parent.parent;
    }
    if (parent) {
      let i = 0;
      for (const node of parent.childNodes) {
        if (node === child) {
          return i;
        }
        i++;
      }
    }
    return null;
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    return (this.texClass != null ? this : prev);
  }
  /**
   * For embellished operators, get the data from the core and clear the core
   *
   * @param {MmlNode} core  The core <mo> for this node
   */
   updateTeXclass(core) {
    if (core) {
      this.prevClass = core.prevClass;
      this.prevLevel = core.prevLevel;
      core.prevClass = core.prevLevel = null;
      this.texClass = core.texClass;
    }
  }
  /**
   * Get the previous element's texClass and scriptlevel
   *
   * @param {MmlNode} prev  The previous node to this one
   */
   getPrevClass(prev) {
    if (prev) {
      this.prevClass = prev.texClass;
      this.prevLevel = prev.attributes.get('scriptlevel') ;
    }
  }

  /**
   * @return {string}  returns the spacing to use before this node
   */
   texSpacing() {
    let prevClass = (this.prevClass != null ? this.prevClass : TEXCLASS.NONE);
    let texClass = this.texClass || TEXCLASS.ORD;
    if (prevClass === TEXCLASS.NONE || texClass === TEXCLASS.NONE) {
      return '';
    }
    if (prevClass === TEXCLASS.VCENTER) {
      prevClass = TEXCLASS.ORD;
    }
    if (texClass === TEXCLASS.VCENTER) {
      texClass = TEXCLASS.ORD;
    }
    let space = TEXSPACE[prevClass][texClass];
    if ((this.prevLevel > 0 || this.attributes.get('scriptlevel') > 0) && space >= 0) {
      return '';
    }
    return TEXSPACELENGTH[Math.abs(space)];
  }

  /**
   * @return {boolean}  The core mo element has an explicit 'form' attribute
   */
   hasSpacingAttributes() {
    return this.isEmbellished && this.coreMO().hasSpacingAttributes();
  }

  /**
   * Sets the inherited propertis for this node, and pushes inherited properties to the children
   *
   *   For each inheritable attribute:
   *     If the node has a default for this attribute, try to inherit it
   *       but check if the noInherit object prevents that.
   *   If the node doesn't have an explicit displaystyle, inherit it
   *   If the node doesn't have an explicit scriptstyle, inherit it
   *   If the prime style is true, set it as a property (it is not a MathML attribute)
   *   Check that the number of children is correct
   *   Finally, push any inherited attributes to teh children.
   *
   * @override
   */
   setInheritedAttributes(attributes = {},
                                display = false, level = 0, prime = false) {
    let defaults = this.attributes.getAllDefaults();
    for (const key of Object.keys(attributes)) {
      if (defaults.hasOwnProperty(key) || AbstractMmlNode.alwaysInherit.hasOwnProperty(key)) {
        let [node, value] = attributes[key];
        let noinherit = (AbstractMmlNode.noInherit[node] || {})[this.kind] || {};
        if (!noinherit[key]) {
          this.attributes.setInherited(key, value);
        }
      }
    }
    let displaystyle = this.attributes.getExplicit('displaystyle');
    if (displaystyle === undefined) {
      this.attributes.setInherited('displaystyle', display);
    }
    let scriptlevel = this.attributes.getExplicit('scriptlevel');
    if (scriptlevel === undefined) {
      this.attributes.setInherited('scriptlevel', level);
    }
    if (prime) {
      this.setProperty('texprimestyle', prime);
    }
    let arity = this.arity;
    if (arity >= 0 && arity !== Infinity && ((arity === 1 && this.childNodes.length === 0) ||
                                             (arity !== 1 && this.childNodes.length !== arity))) {
      //
      //  Make sure there are the right number of child nodes
      //  (trim them or add empty mrows)
      //
      if (arity < this.childNodes.length) {
        this.childNodes = this.childNodes.slice(0, arity);
      } else {
        while (this.childNodes.length < arity) {
          this.appendChild(this.factory.create('mrow'));
        }
      }
    }
    this.setChildInheritedAttributes(attributes, display, level, prime);
  }
  /**
   * Apply inherited attributes to all children
   * (Some classes override this to handle changes in displaystyle and scriptlevel)
   *
   * @param {AttributeList} attributes  The list of inheritable attributes (with the node kinds
   *                                    from which they came)
   * @param {boolean} display           The displaystyle to inherit
   * @param {number} level              The scriptlevel to inherit
   * @param {boolean} prime             The TeX prime style to inherit (T vs. T', etc).
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    for (const child of this.childNodes) {
      child.setInheritedAttributes(attributes, display, level, prime);
    }
  }
  /**
   * Used by subclasses to add their own attributes to the inherited list
   * (e.g., mstyle uses this to augment the inherited attibutes)
   *
   * @param {AttributeList} current    The current list of inherited attributes
   * @param {PropertyList} attributes  The new attributes to add into the list
   */
   addInheritedAttributes(current, attributes) {
    let updated = {...current};
    for (const name of Object.keys(attributes)) {
      if (name !== 'displaystyle' && name !== 'scriptlevel' && name !== 'style') {
        updated[name] = [this.kind, attributes[name]];
      }
    }
    return updated;
  }

  /**
   * Set the nodes inherited attributes based on the attributes of the given node
   *   (used for creating extra nodes in the tree after setInheritedAttributes has already run)
   *
   * @param {MmlNode} node   The node whose attributes are to be used as a template
   */
   inheritAttributesFrom(node) {
    const attributes = node.attributes;
    const display = attributes.get('displaystyle') ;
    const scriptlevel = attributes.get('scriptlevel') ;
    const defaults = (!attributes.isSet('mathsize') ? {} : {
      mathsize: ['math', attributes.get('mathsize')]
    });
    const prime = node.getProperty('texprimestyle')  || false;
    this.setInheritedAttributes(defaults, display, scriptlevel, prime);
  }

  /**
   * Verify the attributes, and that there are the right number of children.
   * Then verify the children.
   *
   * @param {PropertyList} options   The options telling how much to verify
   */
   verifyTree(options = null) {
    if (options === null) {
      return;
    }
    this.verifyAttributes(options);
    let arity = this.arity;
    if (options['checkArity']) {
      if (arity >= 0 && arity !== Infinity &&
          ((arity === 1 && this.childNodes.length === 0) ||
           (arity !== 1 && this.childNodes.length !== arity))) {
        this.mError('Wrong number of children for "' + this.kind + '" node', options, true);
      }
    }
    this.verifyChildren(options);
  }

  /**
   * Verify that all the attributes are valid (i.e., have defaults)
   *
   * @param {PropertyList} options   The options telling how much to verify
   */
   verifyAttributes(options) {
    if (options['checkAttributes']) {
      const attributes = this.attributes;
      const bad = [];
      for (const name of attributes.getExplicitNames()) {
        if (name.substr(0, 5) !== 'data-' && attributes.getDefault(name) === undefined &&
            !name.match(/^(?:class|style|id|(?:xlink:)?href)$/)) {
          // FIXME: provide a configurable checker for names that are OK
          bad.push(name);
        }
        // FIXME: add ability to check attribute values?
      }
      if (bad.length) {
        this.mError('Unknown attributes for ' + this.kind + ' node: ' + bad.join(', '), options);
      }
    }
  }

  /**
   * Verify the children.
   *
   * @param {PropertyList} options   The options telling how much to verify
   */
   verifyChildren(options) {
    for (const child of this.childNodes) {
      child.verifyTree(options);
    }
  }

  /**
   * Replace the current node with an error message (or the name of the node)
   *
   * @param {string} message         The error message to use
   * @param {PropertyList} options   The options telling how much to verify
   * @param {boolean} short          True means use just the kind if not using full errors
   */
   mError(message, options, short = false) {
    if (this.parent && this.parent.isKind('merror')) {
      return null;
    }
    let merror = this.factory.create('merror');
    if (options['fullErrors'] || short) {
      let mtext = this.factory.create('mtext');
      let text = this.factory.create('text') ;
      text.setText(options['fullErrors'] ? message : this.kind);
      mtext.appendChild(text);
      merror.appendChild(mtext);
      this.parent.replaceChild(merror, this);
    } else {
      this.parent.replaceChild(merror, this);
      merror.appendChild(this);
    }
    return merror;
  }

} AbstractMmlNode.__initStatic(); AbstractMmlNode.__initStatic2(); AbstractMmlNode.__initStatic3(); AbstractMmlNode.__initStatic4();

/*****************************************************************/
/**
 *  The abstract MmlNode Token node class (extends the AbstractMmlNode)
 */

class AbstractMmlTokenNode extends AbstractMmlNode {

  /**
   * Add the attributes common to all token nodes
   */
   static __initStatic5() {this.defaults = {
      ...AbstractMmlNode.defaults,
    mathvariant: 'normal',
    mathsize: INHERIT
  };}

  /**
   * @override
   */
   get isToken() {
    return true;
  }

  /**
   * Get the text of the token node (skipping mglyphs, and combining
   *   multiple text nodes)
   */
   getText() {
    let text = '';
    for (const child of this.childNodes) {
      if (child instanceof TextNode) {
        text += child.getText();
      }
    }
    return text;
  }

  /**
   * Only inherit to child nodes that are AbstractMmlNodes (not TextNodes)
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    for (const child of this.childNodes) {
      if (child instanceof AbstractMmlNode) {
        child.setInheritedAttributes(attributes, display, level, prime);
      }
    }
  }

  /**
   * Only step into children that are AbstractMmlNodes (not TextNodes)
   * @override
   */
   walkTree(func, data) {
    func(this, data);
    for (const child of this.childNodes) {
      if (child instanceof AbstractMmlNode) {
        child.walkTree(func, data);
      }
    }
    return data;
  }

} AbstractMmlTokenNode.__initStatic5();


/*****************************************************************/
/**
 *  The abstract MmlNode Layout class (extends the AbstractMmlNode)
 *
 *  These have inferred mrows (so only one child) and can be
 *  spacelike or embellished based on their contents.
 */

class AbstractMmlLayoutNode extends AbstractMmlNode {

  /**
   * Use the same defaults as AbstractMmlNodes
   */
   static __initStatic6() {this.defaults = AbstractMmlNode.defaults;}

  /**
   * @override
   */
   get isSpacelike() {
    return this.childNodes[0].isSpacelike;
  }

  /**
   * @override
   */
   get isEmbellished() {
    return this.childNodes[0].isEmbellished;
  }

  /**
   * @override
   */
   get arity() {
    return -1;
  }

  /**
   * @override
   */
   core() {
    return this.childNodes[0];
  }

  /**
   * @override
   */
   coreMO() {
    return this.childNodes[0].coreMO();
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    prev = this.childNodes[0].setTeXclass(prev);
    this.updateTeXclass(this.childNodes[0]);
    return prev;
  }
} AbstractMmlLayoutNode.__initStatic6();

/*****************************************************************/
/**
 *  The abstract MmlNode-with-base-node Class (extends the AbstractMmlNode)
 *
 *  These have a base element and other elemetns, (e.g., script elements for msubsup).
 *  They can be embellished (if their base is), and get their TeX classes
 *    from their base with their scripts being handled as separate math lists.
 */

class AbstractMmlBaseNode extends AbstractMmlNode {

  /**
   * Use the same defaults as AbstractMmlNodes
   */
   static __initStatic7() {this.defaults = AbstractMmlNode.defaults;}

  /**
   * @override
   */
   get isEmbellished() {
    return this.childNodes[0].isEmbellished;
  }

  /**
   * @override
   */
   core() {
    return this.childNodes[0];
  }

  /**
   * @override
   */
   coreMO() {
    return this.childNodes[0].coreMO();
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    this.texClass = TEXCLASS.ORD;
    let base = this.childNodes[0];
    if (base) {
      if (this.isEmbellished || base.isKind('mi')) {
        prev = base.setTeXclass(prev);
        this.updateTeXclass(this.core());
      } else {
        base.setTeXclass(null);
        prev = this;
      }
    } else {
      prev = this;
    }
    for (const child of this.childNodes.slice(1)) {
      if (child) {
        child.setTeXclass(null);
      }
    }
    return prev;
  }
} AbstractMmlBaseNode.__initStatic7();

/*****************************************************************/
/**
 *  The abstract MmlNode Empty Class (extends AbstractEmptyNode, implements MmlNode)
 *
 *  These have no children and no attributes (TextNode and XMLNode), so we
 *  override all the methods dealing with them, and with the data that usually
 *  goes with an MmlNode.
 */

class AbstractMmlEmptyNode extends AbstractEmptyNode  {

  /**
   *  Parent is an MmlNode
   */
  

  /**
   * @return {boolean}  Not a token element
   */
   get isToken() {
    return false;
  }

  /**
   * @return {boolean}  Not embellished
   */
   get isEmbellished() {
    return false;
  }

  /**
   * @return {boolean}  Not space-like
   */
   get isSpacelike() {
    return false;
  }

  /**
   * @return {boolean}  Not a container of any kind
   */
   get linebreakContainer() {
    return false;
  }

  /**
   * @return {boolean}  Does not contain new lines
   */
   get hasNewLine() {
    return false;
  }

  /**
   * @return {number}  No children
   */
   get arity() {
    return 0;
  }

  /**
   * @return {boolean}  Is not an inferred row
   */
   get isInferred() {
    return false;
  }

  /**
   * @return {boolean}  Is not a container element
   */
   get notParent() {
    return false;
  }

  /**
   * @return {MmlNode}  Parent is the actual parent
   */
   get Parent() {
    return this.parent;
  }

  /**
   * @return {number}  No TeX class
   */
   get texClass() {
    return TEXCLASS.NONE;
  }

  /**
   * @return {number}  No previous element
   */
   get prevClass() {
    return TEXCLASS.NONE;
  }

  /**
   * @return {number}  No previous element
   */
   get prevLevel() {
    return 0;
  }

  /**
   * @return {boolean}  The core mo element has an explicit 'form' attribute
   */
   hasSpacingAttributes() {
    return false;
  }

  /**
   * return {Attributes}  No attributes, so don't store one
   */
   get attributes() {
    return null;
  }

  /**
   * @override
   */
   core() {
    return this;
  }

  /**
   * @override
   */
   coreMO() {
    return this;
  }

  /**
   * @override
   */
   coreIndex() {
    return 0;
  }

  /**
   * @override
   */
   childPosition() {
    return 0;
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    return prev;
  }
  /**
   * @override
   */
   texSpacing() {
    return '';
  }

  /**
   * No children or attributes, so ignore this call.
   *
   * @override
   */
   setInheritedAttributes(_attributes, _display, _level, _prime) {}

  /**
   * No children or attributes, so ignore this call.
   *
   * @override
   */
   inheritAttributesFrom(_node) {}

  /**
   * No children or attributes, so ignore this call.
   *
   * @param {PropertyList} options  The options for the check
   */
   verifyTree(_options) {}

  /**
   *  @override
   */
   mError(_message, _options, _short = false) {}

}

/*****************************************************************/
/**
 *  The TextNode Class (extends AbstractMmlEmptyNode)
 */

class TextNode extends AbstractMmlEmptyNode {constructor(...args) { super(...args); TextNode.prototype.__init4.call(this); }
  /**
   * The text for this node
   */
   __init4() {this.text = '';}

  /**
   * @override
   */
   get kind() {
    return 'text';
  }

  /**
   * @return {string}  Return the node's text
   */
   getText() {
    return this.text;
  }

  /**
   * @param {string} text  The text to use for the node
   * @return {TextNode}  The text node (for chaining of method calls)
   */
   setText(text) {
    this.text = text;
    return this;
  }

  /**
   * Just use the text
   */
   toString() {
    return this.text;
  }

}


/*****************************************************************/
/**
 *  The XMLNode Class (extends AbstractMmlEmptyNode)
 */

class XMLNode extends AbstractMmlEmptyNode {constructor(...args2) { super(...args2); XMLNode.prototype.__init5.call(this);XMLNode.prototype.__init6.call(this); }
  /**
   * The XML content for this node
   */
   __init5() {this.xml = null;}

  /**
   * DOM adaptor for the content
   */
   __init6() {this.adaptor = null;}

  /**
   * @override
   */
   get kind() {
    return 'XML';
  }

  /**
   * @return {Object}  Return the node's XML content
   */
   getXML() {
    return this.xml;
  }

  /**
   * @param {object} xml  The XML content to be saved
   * @param {DOMAdaptor} adaptor DOM adaptor for the content
   * @return {XMLNode}  The XML node (for chaining of method calls)
   */
   setXML(xml, adaptor = null) {
    this.xml = xml;
    this.adaptor = adaptor;
    return this;
  }

  /**
   * @return {string}  The serialized XML content
   */
   getSerializedXML() {
    return this.adaptor.outerHTML(this.xml);
  }

  /**
   * Just indicate that this is XML data
   */
   toString() {
    return 'XML data';
  }

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements methods for handling asynchronous actions
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */


/*****************************************************************/
/*
 *  The legacy MathJax object  (FIXME: remove this after all v2 code is gone)
 */













/*****************************************************************/
/**
 * A wrapper for actions that may be asynchronous.  This will
 *   rerun the action after the asychronous action completes.
 *   Usually, this is for dynamic loading of files.  Legacy
 *   MathJax does that a lot, so we still need it for now, but
 *   may be able to go without it in the future.
 *
 *   Example:
 *
 *     HandleRetriesFor(() => {
 *
 *         html.findMath()
 *             .compile()
 *             .getMetrics()
 *             .typeset()
 *             .updateDocument();
 *
 *     }).catch(err => {
 *       console.log(err.message);
 *     });
 *
 * @param {Function} code  The code to run that might cause retries
 * @return {Promise}       A promise that is satisfied when the code
 *                         runs completely, and fails if the code
 *                         generates an error (that is not a retry).
 */

function handleRetriesFor(code) {
  return new Promise(function run(ok, fail) {
    try {
      ok(code());
    } catch (err) {
      if (err.retry && err.retry instanceof Promise) {
        err.retry.then(() => run(ok, fail))
                 .catch((perr) => fail(perr));
      } else if (err.restart && err.restart.isCallback) {
        // FIXME: Remove this branch when all legacy code is gone
        MathJax.Callback.After(() => run(ok, fail), err.restart);
      } else {
        fail(err);
      }
    }
  });
}

/*****************************************************************/
/**
 * Tells HandleRetriesFor() to wait for this promise to be fulfilled
 *   before rerunning the code.  Causes an error to be thrown, so
 *   calling this terminates the code at that point.
 *
 * @param {Promise} promise  The promise that must be satisfied before
 *                            actions will continue
 */

function retryAfter(promise) {
  let err = new Error('MathJax retry') ;
  err.retry = promise;
  throw err;
}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */




/*****************************************************************/
/**
 *  The HandlerList class (extends PrioritizedList of Handlers)
 *
 *  This list is used to find the handler for a given document
 *  by asking each handler to test if it can handle the document,
 *  and when one can, it is asked to create its associated MathDocument.
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class HandlerList extends PrioritizedList  {

  /**
   * @param {Handler} handler  The handler to register
   * @return {Handler}  The list item created for the handler
   */
   register(handler) {
    return this.add(handler, handler.priority);
  }

  /**
   * @param {Handler} Handler  The handler to remove from the list
   */
   unregister(handler) {
    this.remove(handler);
  }

  /**
   * @param {any} document  The document (string, window, DOM element, etc) to be handled
   * @return {Handler}      The handler from the list that can process the given document
   */
   handlesDocument(document) {
    for (const item of this) {
      let handler = item.item;
      if (handler.handlesDocument(document)) {
        return handler;
      }
    }
    throw new Error(`Can't find handler for document`);
  }

  /**
   * @param {any} document        The document to be processed
   * @param {OptionList} options  The options for the handler
   * @return {MathDocument}       The MathDocument created by the handler for this document
   */
   document(document, options = null) {
    return this.handlesDocument(document).create(document, options);
  }

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */



/*****************************************************************/
/**
 * The main MathJax global object
 */
const mathjax = {
  /**
   *  The MathJax version number
   */
  version: '3.1.0',

  /**
   *  The list of registers document handlers
   */
  handlers: new HandlerList(),

  /**
   * Creates a MathDocument using a registered handler that knows how to handl it
   *
   * @param {any} document        The document to handle
   * @param {OptionLis} options   The options to use for the document (e.g., input and output jax)
   * @return {MathDocument}       The MathDocument to handle the document
   */
  document: function (document, options) {
    return mathjax.handlers.document(document, options);
  },

  /**
   * The functions for handling retries if a file must be loaded dynamically
   */
  handleRetriesFor: handleRetriesFor,
  retryAfter: retryAfter,

  /**
   * A function for loading external files (can be changed for node/browser use)
   */
  asyncLoad: null ,

};

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * Load a file asynchronously using the mathjax.asynchLoad method, if there is one
 *
 * @param {string} name  The name of the file to load
 * @return {Promise}     The promise that is satisfied when the file is loaded
 */
function asyncLoad(name) {
  if (!mathjax.asyncLoad) {
    return Promise.reject(`Can't load '${name}': No asyncLoad method specified`);
  }
  return new Promise((ok, fail) => {
    const result = mathjax.asyncLoad(name);
    if (result instanceof Promise) {
      result.then((value) => ok(value)).catch((err) => fail(err));
    } else {
      ok(result);
    }
  });
}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 *  The entity name-to-value translation table
 *  (basic math entities -- others are loaded from external files)
 */
const entities = {
  ApplyFunction: '\u2061',
  Backslash: '\u2216',
  Because: '\u2235',
  Breve: '\u02D8',
  Cap: '\u22D2',
  CenterDot: '\u00B7',
  CircleDot: '\u2299',
  CircleMinus: '\u2296',
  CirclePlus: '\u2295',
  CircleTimes: '\u2297',
  Congruent: '\u2261',
  ContourIntegral: '\u222E',
  Coproduct: '\u2210',
  Cross: '\u2A2F',
  Cup: '\u22D3',
  CupCap: '\u224D',
  Dagger: '\u2021',
  Del: '\u2207',
  Delta: '\u0394',
  Diamond: '\u22C4',
  DifferentialD: '\u2146',
  DotEqual: '\u2250',
  DoubleDot: '\u00A8',
  DoubleRightTee: '\u22A8',
  DoubleVerticalBar: '\u2225',
  DownArrow: '\u2193',
  DownLeftVector: '\u21BD',
  DownRightVector: '\u21C1',
  DownTee: '\u22A4',
  Downarrow: '\u21D3',
  Element: '\u2208',
  EqualTilde: '\u2242',
  Equilibrium: '\u21CC',
  Exists: '\u2203',
  ExponentialE: '\u2147',
  FilledVerySmallSquare: '\u25AA',
  ForAll: '\u2200',
  Gamma: '\u0393',
  Gg: '\u22D9',
  GreaterEqual: '\u2265',
  GreaterEqualLess: '\u22DB',
  GreaterFullEqual: '\u2267',
  GreaterLess: '\u2277',
  GreaterSlantEqual: '\u2A7E',
  GreaterTilde: '\u2273',
  Hacek: '\u02C7',
  Hat: '\u005E',
  HumpDownHump: '\u224E',
  HumpEqual: '\u224F',
  Im: '\u2111',
  ImaginaryI: '\u2148',
  Integral: '\u222B',
  Intersection: '\u22C2',
  InvisibleComma: '\u2063',
  InvisibleTimes: '\u2062',
  Lambda: '\u039B',
  Larr: '\u219E',
  LeftAngleBracket: '\u27E8',
  LeftArrow: '\u2190',
  LeftArrowRightArrow: '\u21C6',
  LeftCeiling: '\u2308',
  LeftDownVector: '\u21C3',
  LeftFloor: '\u230A',
  LeftRightArrow: '\u2194',
  LeftTee: '\u22A3',
  LeftTriangle: '\u22B2',
  LeftTriangleEqual: '\u22B4',
  LeftUpVector: '\u21BF',
  LeftVector: '\u21BC',
  Leftarrow: '\u21D0',
  Leftrightarrow: '\u21D4',
  LessEqualGreater: '\u22DA',
  LessFullEqual: '\u2266',
  LessGreater: '\u2276',
  LessSlantEqual: '\u2A7D',
  LessTilde: '\u2272',
  Ll: '\u22D8',
  Lleftarrow: '\u21DA',
  LongLeftArrow: '\u27F5',
  LongLeftRightArrow: '\u27F7',
  LongRightArrow: '\u27F6',
  Longleftarrow: '\u27F8',
  Longleftrightarrow: '\u27FA',
  Longrightarrow: '\u27F9',
  Lsh: '\u21B0',
  MinusPlus: '\u2213',
  NestedGreaterGreater: '\u226B',
  NestedLessLess: '\u226A',
  NotDoubleVerticalBar: '\u2226',
  NotElement: '\u2209',
  NotEqual: '\u2260',
  NotExists: '\u2204',
  NotGreater: '\u226F',
  NotGreaterEqual: '\u2271',
  NotLeftTriangle: '\u22EA',
  NotLeftTriangleEqual: '\u22EC',
  NotLess: '\u226E',
  NotLessEqual: '\u2270',
  NotPrecedes: '\u2280',
  NotPrecedesSlantEqual: '\u22E0',
  NotRightTriangle: '\u22EB',
  NotRightTriangleEqual: '\u22ED',
  NotSubsetEqual: '\u2288',
  NotSucceeds: '\u2281',
  NotSucceedsSlantEqual: '\u22E1',
  NotSupersetEqual: '\u2289',
  NotTilde: '\u2241',
  NotVerticalBar: '\u2224',
  Omega: '\u03A9',
  OverBar: '\u203E',
  OverBrace: '\u23DE',
  PartialD: '\u2202',
  Phi: '\u03A6',
  Pi: '\u03A0',
  PlusMinus: '\u00B1',
  Precedes: '\u227A',
  PrecedesEqual: '\u2AAF',
  PrecedesSlantEqual: '\u227C',
  PrecedesTilde: '\u227E',
  Product: '\u220F',
  Proportional: '\u221D',
  Psi: '\u03A8',
  Rarr: '\u21A0',
  Re: '\u211C',
  ReverseEquilibrium: '\u21CB',
  RightAngleBracket: '\u27E9',
  RightArrow: '\u2192',
  RightArrowLeftArrow: '\u21C4',
  RightCeiling: '\u2309',
  RightDownVector: '\u21C2',
  RightFloor: '\u230B',
  RightTee: '\u22A2',
  RightTeeArrow: '\u21A6',
  RightTriangle: '\u22B3',
  RightTriangleEqual: '\u22B5',
  RightUpVector: '\u21BE',
  RightVector: '\u21C0',
  Rightarrow: '\u21D2',
  Rrightarrow: '\u21DB',
  Rsh: '\u21B1',
  Sigma: '\u03A3',
  SmallCircle: '\u2218',
  Sqrt: '\u221A',
  Square: '\u25A1',
  SquareIntersection: '\u2293',
  SquareSubset: '\u228F',
  SquareSubsetEqual: '\u2291',
  SquareSuperset: '\u2290',
  SquareSupersetEqual: '\u2292',
  SquareUnion: '\u2294',
  Star: '\u22C6',
  Subset: '\u22D0',
  SubsetEqual: '\u2286',
  Succeeds: '\u227B',
  SucceedsEqual: '\u2AB0',
  SucceedsSlantEqual: '\u227D',
  SucceedsTilde: '\u227F',
  SuchThat: '\u220B',
  Sum: '\u2211',
  Superset: '\u2283',
  SupersetEqual: '\u2287',
  Supset: '\u22D1',
  Therefore: '\u2234',
  Theta: '\u0398',
  Tilde: '\u223C',
  TildeEqual: '\u2243',
  TildeFullEqual: '\u2245',
  TildeTilde: '\u2248',
  UnderBar: '\u005F',
  UnderBrace: '\u23DF',
  Union: '\u22C3',
  UnionPlus: '\u228E',
  UpArrow: '\u2191',
  UpDownArrow: '\u2195',
  UpTee: '\u22A5',
  Uparrow: '\u21D1',
  Updownarrow: '\u21D5',
  Upsilon: '\u03A5',
  Vdash: '\u22A9',
  Vee: '\u22C1',
  VerticalBar: '\u2223',
  VerticalTilde: '\u2240',
  Vvdash: '\u22AA',
  Wedge: '\u22C0',
  Xi: '\u039E',
  amp: '\u0026',
  acute: '\u00B4',
  aleph: '\u2135',
  alpha: '\u03B1',
  amalg: '\u2A3F',
  and: '\u2227',
  ang: '\u2220',
  angmsd: '\u2221',
  angsph: '\u2222',
  ape: '\u224A',
  backprime: '\u2035',
  backsim: '\u223D',
  backsimeq: '\u22CD',
  beta: '\u03B2',
  beth: '\u2136',
  between: '\u226C',
  bigcirc: '\u25EF',
  bigodot: '\u2A00',
  bigoplus: '\u2A01',
  bigotimes: '\u2A02',
  bigsqcup: '\u2A06',
  bigstar: '\u2605',
  bigtriangledown: '\u25BD',
  bigtriangleup: '\u25B3',
  biguplus: '\u2A04',
  blacklozenge: '\u29EB',
  blacktriangle: '\u25B4',
  blacktriangledown: '\u25BE',
  blacktriangleleft: '\u25C2',
  bowtie: '\u22C8',
  boxdl: '\u2510',
  boxdr: '\u250C',
  boxminus: '\u229F',
  boxplus: '\u229E',
  boxtimes: '\u22A0',
  boxul: '\u2518',
  boxur: '\u2514',
  bsol: '\u005C',
  bull: '\u2022',
  cap: '\u2229',
  check: '\u2713',
  chi: '\u03C7',
  circ: '\u02C6',
  circeq: '\u2257',
  circlearrowleft: '\u21BA',
  circlearrowright: '\u21BB',
  circledR: '\u00AE',
  circledS: '\u24C8',
  circledast: '\u229B',
  circledcirc: '\u229A',
  circleddash: '\u229D',
  clubs: '\u2663',
  colon: '\u003A',
  comp: '\u2201',
  ctdot: '\u22EF',
  cuepr: '\u22DE',
  cuesc: '\u22DF',
  cularr: '\u21B6',
  cup: '\u222A',
  curarr: '\u21B7',
  curlyvee: '\u22CE',
  curlywedge: '\u22CF',
  dagger: '\u2020',
  daleth: '\u2138',
  ddarr: '\u21CA',
  deg: '\u00B0',
  delta: '\u03B4',
  digamma: '\u03DD',
  div: '\u00F7',
  divideontimes: '\u22C7',
  dot: '\u02D9',
  doteqdot: '\u2251',
  dotplus: '\u2214',
  dotsquare: '\u22A1',
  dtdot: '\u22F1',
  ecir: '\u2256',
  efDot: '\u2252',
  egs: '\u2A96',
  ell: '\u2113',
  els: '\u2A95',
  empty: '\u2205',
  epsi: '\u03B5',
  epsiv: '\u03F5',
  erDot: '\u2253',
  eta: '\u03B7',
  eth: '\u00F0',
  flat: '\u266D',
  fork: '\u22D4',
  frown: '\u2322',
  gEl: '\u2A8C',
  gamma: '\u03B3',
  gap: '\u2A86',
  gimel: '\u2137',
  gnE: '\u2269',
  gnap: '\u2A8A',
  gne: '\u2A88',
  gnsim: '\u22E7',
  gt: '\u003E',
  gtdot: '\u22D7',
  harrw: '\u21AD',
  hbar: '\u210F',
  hellip: '\u2026',
  hookleftarrow: '\u21A9',
  hookrightarrow: '\u21AA',
  imath: '\u0131',
  infin: '\u221E',
  intcal: '\u22BA',
  iota: '\u03B9',
  jmath: '\u0237',
  kappa: '\u03BA',
  kappav: '\u03F0',
  lEg: '\u2A8B',
  lambda: '\u03BB',
  lap: '\u2A85',
  larrlp: '\u21AB',
  larrtl: '\u21A2',
  lbrace: '\u007B',
  lbrack: '\u005B',
  le: '\u2264',
  leftleftarrows: '\u21C7',
  leftthreetimes: '\u22CB',
  lessdot: '\u22D6',
  lmoust: '\u23B0',
  lnE: '\u2268',
  lnap: '\u2A89',
  lne: '\u2A87',
  lnsim: '\u22E6',
  longmapsto: '\u27FC',
  looparrowright: '\u21AC',
  lowast: '\u2217',
  loz: '\u25CA',
  lt: '\u003C',
  ltimes: '\u22C9',
  ltri: '\u25C3',
  macr: '\u00AF',
  malt: '\u2720',
  mho: '\u2127',
  mu: '\u03BC',
  multimap: '\u22B8',
  nLeftarrow: '\u21CD',
  nLeftrightarrow: '\u21CE',
  nRightarrow: '\u21CF',
  nVDash: '\u22AF',
  nVdash: '\u22AE',
  natur: '\u266E',
  nearr: '\u2197',
  nharr: '\u21AE',
  nlarr: '\u219A',
  not: '\u00AC',
  nrarr: '\u219B',
  nu: '\u03BD',
  nvDash: '\u22AD',
  nvdash: '\u22AC',
  nwarr: '\u2196',
  omega: '\u03C9',
  omicron: '\u03BF',
  or: '\u2228',
  osol: '\u2298',
  period: '\u002E',
  phi: '\u03C6',
  phiv: '\u03D5',
  pi: '\u03C0',
  piv: '\u03D6',
  prap: '\u2AB7',
  precnapprox: '\u2AB9',
  precneqq: '\u2AB5',
  precnsim: '\u22E8',
  prime: '\u2032',
  psi: '\u03C8',
  quot: '\u0022',
  rarrtl: '\u21A3',
  rbrace: '\u007D',
  rbrack: '\u005D',
  rho: '\u03C1',
  rhov: '\u03F1',
  rightrightarrows: '\u21C9',
  rightthreetimes: '\u22CC',
  ring: '\u02DA',
  rmoust: '\u23B1',
  rtimes: '\u22CA',
  rtri: '\u25B9',
  scap: '\u2AB8',
  scnE: '\u2AB6',
  scnap: '\u2ABA',
  scnsim: '\u22E9',
  sdot: '\u22C5',
  searr: '\u2198',
  sect: '\u00A7',
  sharp: '\u266F',
  sigma: '\u03C3',
  sigmav: '\u03C2',
  simne: '\u2246',
  smile: '\u2323',
  spades: '\u2660',
  sub: '\u2282',
  subE: '\u2AC5',
  subnE: '\u2ACB',
  subne: '\u228A',
  supE: '\u2AC6',
  supnE: '\u2ACC',
  supne: '\u228B',
  swarr: '\u2199',
  tau: '\u03C4',
  theta: '\u03B8',
  thetav: '\u03D1',
  tilde: '\u02DC',
  times: '\u00D7',
  triangle: '\u25B5',
  triangleq: '\u225C',
  upsi: '\u03C5',
  upuparrows: '\u21C8',
  veebar: '\u22BB',
  vellip: '\u22EE',
  weierp: '\u2118',
  xi: '\u03BE',
  yen: '\u00A5',
  zeta: '\u03B6',
  zigrarr: '\u21DD'
};

/**
 * The files that have been loaded
 */
const loaded = {};

/**
 * @param {string} text  The text whose entities are to be replaced
 * @return {string}      The text with entries replaced
 */
function translate(text) {
  return text.replace(/&([a-z][a-z0-9]*|#(?:[0-9]+|x[0-9a-f]+));/ig, replace);
}

/**
 * Returns the unicode character for an entity, if found
 * If not, loads an entity file to see if it is there (and retries after loading)
 * Otherwire, returns the original entity string
 *
 * @param {string} match   The complete entity being replaced
 * @param {string} entity  The name of the entity to be replaced
 * @return {string}        The unicode character for the entity, or the entity name (if none found)
 */
function replace(match, entity) {
  if (entity.charAt(0) === '#') {
    return numeric(entity.slice(1));
  }
  if (entities[entity]) {
    return entities[entity];
  }
  {
    let file = (entity.match(/^[a-zA-Z](fr|scr|opf)$/) ? RegExp.$1 : entity.charAt(0).toLowerCase());
    if (!loaded[file]) {
      loaded[file] = true;
      retryAfter(asyncLoad('./util/entities/' + file + '.js'));
    }
  }
  return match;
}

/**
 * @param {string} entity  The character code point as a string
 * @return {string}        The character(s) with the given code point
 */
function numeric(entity) {
  let n = (entity.charAt(0) === 'x' ?
           parseInt(entity.slice(1), 16) :
           parseInt(entity));
  return String.fromCodePoint(n);
}

/********************************************************************/
/**
 *  The class for performing the MathML DOM node to
 *  internal MmlNode conversion.
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class MathMLCompile {

  /**
   *  The default options for this object
   */
   static __initStatic() {this.OPTIONS = {
    MmlFactory: null,                   // The MmlFactory to use (defaults to a new MmlFactory)
    fixMisplacedChildren: true,         // True if we want to use heuristics to try to fix
                                        //   problems with the tree based on HTML not handling
                                        //   self-closing tags properly
    verify: {                           // Options to pass to verifyTree() controlling MathML verification
      ...AbstractMmlNode.verifyDefaults
    },
    translateEntities: true             // True means translate entities in text nodes
  };}

  /**
   * The DOMAdaptor for the document being processed
   */
  

  /**
   *  The instance of the MmlFactory object and
   */
  
  /**
   *  The options (the defaults with the user options merged in)
   */
  

  /**
   *  Merge the user options into the defaults, and save them
   *  Create the MmlFactory object
   *
   * @param {OptionList} options  The options controlling the conversion
   */
  constructor(options = {}) {
    const Class = this.constructor ;
    this.options = userOptions(defaultOptions({}, Class.OPTIONS), options);
  }

  /**
   * @param{MmlFactory} mmlFactory   The MathML factory to use for new nodes
   */
   setMmlFactory(mmlFactory) {
    this.factory = mmlFactory;
  }

  /**
   * Convert a MathML DOM tree to internal MmlNodes
   *
   * @param {N} node     The <math> node to convert to MmlNodes
   * @return {MmlNode}   The MmlNode at the root of the converted tree
   */
   compile(node) {
    let mml = this.makeNode(node);
    mml.verifyTree(this.options['verify']);
    mml.setInheritedAttributes({}, false, 0, false);
    mml.walkTree(this.markMrows);
    return mml;
  }

  /**
   * Recursively convert nodes and their children, taking MathJax classes
   * into account.
   *
   *  FIXME: we should use data-* attributes rather than classes for these
   *
   * @param {N} node     The node to convert to an MmlNode
   * @return {MmlNode}   The converted MmlNode
   */
   makeNode(node) {
    const adaptor = this.adaptor;
    let limits = false;
    let kind = adaptor.kind(node).replace(/^.*:/, '');
    let texClass = adaptor.getAttribute(node, 'data-mjx-texclass') || '';
    if (texClass) {
      texClass = this.filterAttribute('data-mjx-texclass', texClass) || '';
    }
    let type = texClass && kind === 'mrow' ? 'TeXAtom' : kind;
    for (const name of this.filterClassList(adaptor.allClasses(node))) {
      if (name.match(/^MJX-TeXAtom-/)) {
        texClass = name.substr(12);
        type = 'TeXAtom';
      } else if (name === 'MJX-fixedlimits') {
        limits = true;
      }
    }
    this.factory.getNodeClass(type) || this.error('Unknown node type "' + type + '"');
    let mml = this.factory.create(type);
    if (type === 'TeXAtom') {
      this.texAtom(mml, texClass, limits);
    } else if (texClass) {
      mml.texClass = (TEXCLASS )[texClass];
      mml.setProperty('texClass', mml.texClass);
    }
    this.addAttributes(mml, node);
    this.checkClass(mml, node);
    this.addChildren(mml, node);
    return mml;
  }

  /**
   * Copy the attributes from a MathML node to an MmlNode.
   *
   * @param {MmlNode} mml       The MmlNode to which attributes will be added
   * @param {N} node  The MathML node whose attributes to copy
   */
   addAttributes(mml, node) {
    let ignoreVariant = false;
    for (const attr of this.adaptor.allAttributes(node)) {
      let name = attr.name;
      let value = this.filterAttribute(name, attr.value);
      if (value === null) {
        return;
      }
      if (name.substr(0, 9) === 'data-mjx-') {
        if (name === 'data-mjx-alternate') {
          mml.setProperty('variantForm', true);
        } else if (name === 'data-mjx-variant') {
          mml.attributes.set('mathvariant', value);
          ignoreVariant = true;
        }
      } else if (name !== 'class') {
        let val = value.toLowerCase();
        if (val === 'true' || val === 'false') {
          mml.attributes.set(name, val === 'true');
        } else if (!ignoreVariant || name !== 'mathvariant') {
          mml.attributes.set(name, value);
        }
      }
    }
  }

  /**
   * Provide a hook for the Safe extension to filter attribute values.
   *
   * @param {string} name   The name of an attribute to filter
   * @param {string} value  The value to filter
   */
   filterAttribute(_name, value) {
    return value;
  }

  /**
   * Provide a hook for the Safe extension to filter class names.
   *
   * @param {string[]} list   The list of class names to filter
   */
   filterClassList(list) {
    return list;
  }

  /**
   * Convert the children of the MathML node and add them to the MmlNode
   *
   * @param {MmlNode} mml  The MmlNode to which children will be added
   * @param {N} node       The MathML node whose children are to be copied
   */
   addChildren(mml, node) {
    if (mml.arity === 0) {
      return;
    }
    const adaptor = this.adaptor;
    for (const child of adaptor.childNodes(node) ) {
      const name = adaptor.kind(child);
      if (name === '#comment') {
        continue;
      }
      if (name === '#text') {
        this.addText(mml, child);
      } else if (mml.isKind('annotation-xml')) {
        mml.appendChild((this.factory.create('XML') ).setXML(child, adaptor));
      } else {
        let childMml = mml.appendChild(this.makeNode(child)) ;
        if (childMml.arity === 0 && adaptor.childNodes(child).length) {
          if (this.options['fixMisplacedChildren']) {
            this.addChildren(mml, child);
          } else {
            childMml.mError('There should not be children for ' + childMml.kind + ' nodes',
                            this.options['verify'], true);
          }
        }
      }
    }
  }

  /**
   * Add text to a token node
   *
   * @param {MmlNode} mml  The MmlNode to which text will be added
   * @param {N} child      The text node whose contents is to be copied
   */
   addText(mml, child) {
    let text = this.adaptor.value(child);
    if ((mml.isToken || mml.getProperty('isChars')) && mml.arity) {
      if (mml.isToken) {
        text = translate(text);
        text = this.trimSpace(text);
      }
      mml.appendChild((this.factory.create('text') ).setText(text));
    } else if (text.match(/\S/)) {
      this.error('Unexpected text node "' + text + '"');
    }
  }

  /**
   * Check for special MJX values in the class and process them
   *
   * @param {MmlNode} mml       The MmlNode to be modified according to the class markers
   * @param {N} node  The MathML node whose class is to be processed
   */
   checkClass(mml, node) {
    let classList = [];
    for (const name of this.filterClassList(this.adaptor.allClasses(node))) {
      if (name.substr(0, 4) === 'MJX-') {
        if (name === 'MJX-variant') {
          mml.setProperty('variantForm', true);
        } else if (name.substr(0, 11) !== 'MJX-TeXAtom') {
          mml.attributes.set('mathvariant', this.fixCalligraphic(name.substr(3)));
        }
      } else {
        classList.push(name);
      }
    }
    if (classList.length) {
      mml.attributes.set('class', classList.join(' '));
    }
  }

  /**
   * Fix the old incorrect spelling of calligraphic.
   *
   * @param {string} variant  The mathvariant name
   * @return {string}         The corrected variant
   */
   fixCalligraphic(variant) {
    return variant.replace(/caligraphic/, 'calligraphic');
  }

  /**
   * Handle the properties of a TeXAtom
   *
   * @param {MmlNode} mml      The node to be updated
   * @param {string} texClass  The texClass indicated in the MJX class identifier
   * @param {boolean} limits   Whether MJX-fixedlimits was found in the class list
   */
   texAtom(mml, texClass, limits) {
    mml.texClass = (TEXCLASS )[texClass];
    mml.setProperty('texClass', mml.texClass);
    if (texClass === 'OP' && !limits) {
      mml.setProperty('movesupsub', true);
      mml.attributes.setInherited('movablelimits', true);
    }
  }

  /**
   * Check to see if an mrow has delimiters at both ends (so looks like an mfenced structure).
   *
   * @param {MmlNode} mml  The node to check for mfenced structure
   */
   markMrows(mml) {
    if (mml.isKind('mrow') && !mml.isInferred && mml.childNodes.length >= 2) {
      let first = mml.childNodes[0] ;
      let last = mml.childNodes[mml.childNodes.length - 1] ;
      if (first.isKind('mo') && first.attributes.get('fence') &&
          last.isKind('mo') && last.attributes.get('fence')) {
        if (first.childNodes.length) {
          mml.setProperty('open', (first ).getText());
        }
        if (last.childNodes.length) {
          mml.setProperty('close', (last ).getText());
        }
      }
    }
  }

  /**
   * @param {string} text  The text to have leading/trailing spaced removed
   * @return {string}      The trimmed text
   */
   trimSpace(text) {
    return text.replace(/[\t\n\r]/g, ' ')    // whitespace to spaces
               .replace(/^ +/, '')           // initial whitespace
               .replace(/ +$/, '')           // trailing whitespace
               .replace(/  +/g, ' ');        // internal multiple whitespace
  }

  /**
   * @param {string} message  The error message to produce
   */
   error(message) {
    throw new Error(message);
  }
} MathMLCompile.__initStatic();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 *  Implements the MathML class (extends AbstractInputJax)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class MathML extends AbstractInputJax {
  /**
   * The name of this input jax
   */
   static __initStatic() {this.NAME = "MathML";}

  /**
   * @override
   */
   static __initStatic2() {this.OPTIONS = defaultOptions(
    {
      parseAs: "html", // Whether to use HTML or XML parsing for the MathML string
      forceReparse: false, // Whether to force the string to be reparsed, or use the one from the document DOM
      FindMathML: null, // The FindMathML instance to override the default one
      MathMLCompile: null, // The MathMLCompile instance to override the default one
      /*
       * The function to use to handle a parsing error (throw an error by default)
       */
      parseError: function (node) {
        this.error(this.adaptor.textContent(node).replace(/\n.*/g, ""));
      },
    },
    AbstractInputJax.OPTIONS
  );}

  /**
   * The FindMathML instance used to locate MathML in the document
   */
  

  /**
   * The MathMLCompile instance used to convert the MathML tree to internal format
   */
  

  /**
   * A list of functions to call on the parsed MathML DOM before conversion to internal structure
   */
  

  /**
   * @override
   */
  constructor(options = {}) {
    let [mml, find, compile] = separateOptions(
      options,
      FindMathML.OPTIONS,
      MathMLCompile.OPTIONS
    );
    super(mml);
    this.findMathML =
      this.options["FindMathML"] || new FindMathML(find);
    this.mathml =
      this.options["MathMLCompile"] || new MathMLCompile(compile);
    this.mmlFilters = new FunctionList();
  }

  /**
   * Set the adaptor in any of the objects that need it
   *
   * @override
   */
   setAdaptor(adaptor) {
    super.setAdaptor(adaptor);
    this.findMathML.adaptor = adaptor;
    this.mathml.adaptor = adaptor;
  }

  /**
   * @param {MmlFactory} mmlFactory  The MmlFactory to use for this MathML input jax
   */
   setMmlFactory(mmlFactory) {
    super.setMmlFactory(mmlFactory);
    this.mathml.setMmlFactory(mmlFactory);
  }

  /**
   * Don't process strings (process nodes)
   *
   * @override
   */
   get processStrings() {
    return false;
  }

  /**
   * Convert a MathItem to internal format:
   *   If there is no existing MathML node, or we are asked to reparse everything
   *     Execute the preFilters on the math
   *     Parse the MathML string in the desired format, and check the result for errors
   *     If we got an HTML document:
   *       Check that it has only one child (the <math> element), and use it
   *     Otherwise
   *       Use the root element from the XML document
   *     If the node is not a <math> node, report the error.
   *   Execute the mmlFilters on the parsed MathML
   *   Compile the MathML to internal format, and execute the postFilters
   *   Return the resulting internal format
   *
   * @override
   */
   compile(math, document) {
    let mml = math.start.node;
    if (
      !mml ||
      !math.end.node ||
      this.options["forceReparse"] ||
      this.adaptor.kind(mml) === "#text"
    ) {
      let mathml = this.executeFilters(
        this.preFilters,
        math,
        document,
        math.math || "<math></math>"
      );
      let doc = this.checkForErrors(
        this.adaptor.parse(mathml, "text/" + this.options["parseAs"])
      );
      let body = this.adaptor.body(doc);
      if (this.adaptor.childNodes(body).length !== 1) {
        this.error("MathML must consist of a single element");
      }
      mml = this.adaptor.remove(this.adaptor.firstChild(body)) ;
      if (this.adaptor.kind(mml).replace(/^[a-z]+:/, "") !== "math") {
        this.error(
          "MathML must be formed by a <math> element, not <" +
            this.adaptor.kind(mml) +
            ">"
        );
      }
    }
    mml = this.executeFilters(this.mmlFilters, math, document, mml);
    return this.executeFilters(
      this.postFilters,
      math,
      document,
      this.mathml.compile(mml )
    );
  }

  /**
   * Check a parsed MathML string for errors.
   *
   * @param {D} doc  The document returns from the DOMParser
   * @return {D}     The document
   */
   checkForErrors(doc) {
    let err = this.adaptor.tags(this.adaptor.body(doc), "parsererror")[0];
    if (err) {
      if (this.adaptor.textContent(err) === "") {
        this.error("Error processing MathML");
      }
      this.options["parseError"].call(this, err);
    }
    return doc;
  }

  /**
   * Throw an error
   *
   * @param {string} message  The error message to produce
   */
   error(message) {
    throw new Error(message);
  }

  /**
   * @override
   */
   findMath(node) {
    return this.findMathML.findMath(node);
  }
} MathML.__initStatic(); MathML.__initStatic2();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 *  The OutputJax interface
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */








































































/*****************************************************************/
/**
 *  The OutputJax abstract class
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class AbstractOutputJax {

  /**
   * The name for the output jax
   */
   static __initStatic() {this.NAME = 'generic';}

  /**
   * The default options for the output jax
   */
   static __initStatic2() {this.OPTIONS = {};}

  /**
   * The actual options supplied to the output jax
   */
  

  /**
   * Filters to run after the output is processed
   */
  

  /**
   * The MathDocument's DOMAdaptor
   */
   __init() {this.adaptor = null;}  // set by the handler

  /**
   * @param {OptionList} options  The options for this instance
   */
  constructor(options = {}) {AbstractOutputJax.prototype.__init.call(this);
    let CLASS = this.constructor ;
    this.options = userOptions(defaultOptions({}, CLASS.OPTIONS), options);
    this.postFilters = new FunctionList();
  }

  /**
   * @return {string}  The name for this output jax class
   */
   get name() {
    return (this.constructor ).NAME;
  }

  /**
   * @override
   */
   setAdaptor(adaptor) {
    this.adaptor = adaptor;
  }

  /**
   * @override
   */
   initialize() {
  }

  /**
   * @override
   */
  






  /**
   * @override
   */
   getMetrics(_document) {
  }

  /**
   * @override
   */
   styleSheet(_document) {
    return null ;
  }

  /**
   * @override
   */
   pageElements(_document) {
    return null ;
  }

  /**
   * Execute a set of filters, passing them the MathItem and any needed data,
   *  and return the (possibly modified) data
   *
   * @param {FunctionList} filters   The list of functions to be performed
   * @param {MathItem} math          The math item that is being processed
   * @param {MathDocument} document  The math document contaiing the math item
   * @param {any} data               Whatever other data is needed
   * @return {any}                   The (possibly modified) data
   */
   executeFilters(
    filters, math,
    document, data
  ) {
    let args = {math, document, data};
    filters.execute(args);
    return args.data;
  }

} AbstractOutputJax.__initStatic(); AbstractOutputJax.__initStatic2();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implement a generic LinkedList object.
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

/*****************************************************************/
/**
 *  A symbol used to mark the special node used to indicate
 *  the start and end of the list.
 */
const END = Symbol();

/**
 * Shorthand type for the functions used to sort the data items
 *
 * @template DataClass   The type of data stored in the list
 */


/*****************************************************************/
/**
 *  The ListItem interface (for a specific type of data item)
 *
 *  These are the items in the doubly-linked list.
 *
 * @template DataClass   The type of data stored in the list
 */

class ListItem {
  /**
   * The data for the list item
   */
  

  /**
   * Pointers to the next item in the list
   */
   __init() {this.next = null;}
  /**
   * Pointers to the previous item in the list
   */
   __init2() {this.prev = null;}

  /**
   * @param {any} data  The data to be stored in the list item
   * @constructor
   */
  constructor (data = null) {ListItem.prototype.__init.call(this);ListItem.prototype.__init2.call(this);
    this.data = data;
  }
}


/*****************************************************************/
/**
 *  Implements the generic LinkedList class
 *
 * @template DataClass   The type of data stored in the list
 */

class LinkedList {

  /**
   * The linked list
   */
  

  /**
   *  This.list is a special ListItem whose next property
   *    points to the head of the list and whose prev
   *    property points to the tail.  This lets us relink
   *    the head and tail items in the same way as any other
   *    item in the list, without having to handle special
   *    cases.
   *
   * @param {DataClass[]} args  The data items that form the initial list
   * @constructor
   */
  constructor(...args) {
    this.list = new ListItem(END);
    this.list.next = this.list.prev = this.list;
    this.push(...args);
  }

  /**
   * Typescript < 2.3 targeted at ES5 doesn't handle
   *
   *     for (const x of this) {...}
   *
   * so use toArray() to convert to array, when needed
   *
   * @return {DataClass[]}  The list converted to an array
   */
   toArray() {
    return Array.from(this);
  }

  /**
   *  Used for sorting and merging lists (Overridden by subclasses)
   *
   * @param {DataClass} a   The first item to compare
   * @param {DataClass} b   The second item to compare
   * @return {boolean}      True if a is before b, false otherwise
   */
   isBefore(a, b) {
    return a < b;
  }

  /**
   * Push items on the end of the list
   *
   * @param {DataClass[]} args   The list of data items to be pushed
   * @return {LinkedList}        The LinkedList object (for chaining)
   */
   push(...args) {
    for (const data of args) {
      let item = new ListItem(data);
      item.next = this.list;
      item.prev = this.list.prev;
      this.list.prev = item;
      item.prev.next = item;
    }
    return this;
  }

  /**
   * Pop the end item off the list and return its data
   *
   * @return {DataClass}  The data from the last item in the list
   */
   pop() {
    let item = this.list.prev;
    if (item.data === END) {
      return null;
    }
    this.list.prev = item.prev;
    item.prev.next = this.list;
    item.next = item.prev = null;
    return item.data ;
  }

  /**
   * Push items at the head of the list
   *
   * @param {DataClass[]} args   The list of data items to inserted
   * @return {LinkedList}        The LinkedList object (for chaining)
   */
   unshift(...args) {
    for (const data of args.slice(0).reverse()) {
      let item = new ListItem(data);
      item.next = this.list.next;
      item.prev = this.list;
      this.list.next = item;
      item.next.prev = item;
    }
    return this;
  }

  /**
   * Remove an item from the head of the list and return its data
   *
   * @return {DataClass}  The data from the first item in the list
   */
   shift() {
    let item = this.list.next;
    if (item.data === END) {
      return null;
    }
    this.list.next = item.next;
    item.next.prev = this.list;
    item.next = item.prev = null;
    return item.data ;
  }

  /**
   * Remove items from the list
   *
   * @param {DataClass[]} items   The items to remove
   */
   remove(...items) {
    const map = new Map();
    for (const item of items) {
      map.set(item, true);
    }
    let item = this.list.next;
    while (item.data !== END) {
      const next = item.next;
      if (map.has(item.data )) {
        item.prev.next = item.next;
        item.next.prev = item.prev;
        item.next = item.prev = null;
      }
      item = next;
    }
  }

  /**
   * Empty the list
   *
   * @return {LinkedList}  The LinkedList object (for chaining)
   */
   clear() {
    this.list.next.prev = this.list.prev.next = null;
    this.list.next = this.list.prev = this.list;
    return this;
  }

  /**
   * Make the list iterable and return the data from the items in the list
   *
   * @return {{next: Function}}  The object containing the iterator's next() function
   */
   [Symbol.iterator]() {
    let current = this.list;
    return {
                                                                    /* tslint:disable-next-line:jsdoc-require */
      next() {
        current = current.next;
        return (current.data === END ?
                {value: null, done: true} :
                {value: current.data, done: false}) ;
      }
    };
  }

  /**
   * An iterator for the list in reverse order
   *
   * @return {Object}  The iterator for walking the list in reverse
   */
                                                                    /* tslint:disable-next-line:jsdoc-require */
   reversed() {
    let current = this.list;
    return {
                                                                    /* tslint:disable-next-line:jsdoc-require */
      [Symbol.iterator]() {
        return this;
      },
                                                                    /* tslint:disable-next-line:jsdoc-require */
      next() {
        current = current.prev;
        return (current.data === END ?
                {value: null, done: true} :
                {value: current.data, done: false}) ;
      },
                                                                    /* tslint:disable-next-line:jsdoc-require */
      toArray() {
        return Array.from(this) ;
      }
    };
  }

  /**
   * Insert a new item into a sorted list in the correct locations
   *
   * @param {DataClass} data   The data item to add
   * @param {SortFn} isBefore   The function used to order the data
   * @param {LinkedList}        The LinkedList object (for chaining)
   */
   insert(data, isBefore = null) {
    if (isBefore === null) {
      isBefore = this.isBefore.bind(this);
    }
    let item = new ListItem(data);
    let cur = this.list.next;
    while (cur.data !== END && isBefore(cur.data , item.data )) {
      cur = cur.next;
    }
    item.prev = cur.prev;
    item.next = cur;
    cur.prev.next = cur.prev = item;
    return this;
  }

  /**
   * Sort the list using an optional sort function
   *
   * @param {SortFn} isBefore  The function used to order the data
   * @return {LinkedList}      The LinkedList object (for chaining)
   */
   sort(isBefore = null) {
    if (isBefore === null) {
      isBefore = this.isBefore.bind(this);
    }
    //
    //  Make an array of singleton lists
    //
    let lists = [];
    for (const item of this) {
      lists.push(new LinkedList(item ));
    }
    //
    //  Clear current list
    //
    this.list.next = this.list.prev = this.list;
    //
    //  Merge pairs of lists until there is only one left
    //
    while (lists.length > 1) {
      let l1 = lists.shift();
      let l2 = lists.shift();
      l1.merge(l2, isBefore);
      lists.push(l1);
    }
    //
    //  Use the final list as our list
    //
    if (lists.length) {
      this.list = lists[0].list;
    }
    return this;
  }

  /**
   * Merge a sorted list with another sorted list
   *
   * @param {LinkedList} list  The list to merge into this instance's list
   * @param {SortFn} isBefore  The function used to order the data
   * @return {LinkedList}      The LinkedList instance (for chaining)
   */
   merge(list, isBefore = null) {
    if (isBefore === null) {
      isBefore = this.isBefore.bind(this);
    }
    //
    //  Get the head of each list
    //
    let lcur = this.list.next;
    let mcur = list.list.next;
    //
    //  While there is more in both lists
    //
    while (lcur.data !== END && mcur.data !== END) {
      //
      //  If the merge item is before the list item
      //    (we have found where the head of the merge list belongs)
      //    Link the merge list into the main list at this point
      //      and make the merge list be the remainder of the original list.
      //    The merge continues by looking for where the rest of the original
      //      list fits into the newly formed main list (the old merge list).
      //  Otherwise
      //    Go on to the next item in the main list
      //
      if (isBefore(mcur.data , lcur.data )) {
        [mcur.prev.next, lcur.prev.next] = [lcur, mcur];
        [mcur.prev, lcur.prev] = [lcur.prev, mcur.prev];
        [this.list.prev.next, list.list.prev.next] = [list.list, this.list];
        [this.list.prev, list.list.prev] = [list.list.prev, this.list.prev];
        [lcur, mcur] = [mcur.next, lcur];
      } else {
        lcur = lcur.next;
      }
    }
    //
    //  If there is more to be merged (i.e., we came to the end of the main list),
    //  then link that at the end of the main list.
    //
    if (mcur.data !== END) {
      this.list.prev.next = list.list.next;
      list.list.next.prev = this.list.prev;
      list.list.prev.next = this.list;
      this.list.prev = list.list.prev;
      list.list.next = list.list.prev = list.list;
    }
    return this;
  }

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 *  The MathList interface (extends LinkedList<MathItem>)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */










/*****************************************************************/
/**
 *  The MathList abstract class (extends LinkedList<MathItem>)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class AbstractMathList extends
LinkedList {

  /**
   * @override
   */
   isBefore(a, b) {
    return (a.start.i < b.start.i || (a.start.i === b.start.i && a.start.n < b.start.n));
  }

}

/*****************************************************************/
/**
 *  Implements the MathItem class
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class AbstractMathItem {

  /**
   * The source text for the math (e.g., TeX string)
   */
  

  /**
   * The input jax associated with this item
   */

  

  /**
   * True when this math is in display mode
   */
  

  /**
   * Reference to the beginning of the math in the document
   */
  
  /**
   * Reference to the end of the math in the document
   */
  

  /**
   * The compiled internal MathML (result of InputJax)
   */
   __init() {this.root = null;}
  /**
   * The typeset result (result of OutputJax)
   */
   __init2() {this.typesetRoot = null;}

  /**
   * The metric information about the surrounding environment
   */
   __init3() {this.metrics = {}; }

  /**
   * Data private to the input jax
   */
   __init4() {this.inputData = {};}

  /**
   * Data private to the output jax
   */
   __init5() {this.outputData = {};}

  /**
   * The current state of the item (how far in the render actions it has been processed)
   */
   __init6() {this._state = STATE.UNPROCESSED;}

  /**
   * @return {boolean}   True when this item is an escaped delimiter
   */
   get isEscaped() {
    return this.display === null;
  }

  /**
   * @param {string} math      The math expression for this item
   * @param {Inputjax} jax     The input jax to use for this item
   * @param {boolean} display  True if display mode, false if inline
   * @param {Location} start   The starting position of the math in the document
   * @param {Location} end     The ending position of the math in the document
   * @constructor
   */
  constructor (math, jax, display = true,
               start = {i: 0, n: 0, delim: ''},
               end = {i: 0, n: 0, delim: ''}) {AbstractMathItem.prototype.__init.call(this);AbstractMathItem.prototype.__init2.call(this);AbstractMathItem.prototype.__init3.call(this);AbstractMathItem.prototype.__init4.call(this);AbstractMathItem.prototype.__init5.call(this);AbstractMathItem.prototype.__init6.call(this);
    this.math = math;
    this.inputJax = jax;
    this.display = display;
    this.start = start;
    this.end = end;
    this.root = null;
    this.typesetRoot = null;
    this.metrics = {} ;
    this.inputData = {};
    this.outputData = {};
  }

  /**
   * @override
   */
   render(document) {
    document.renderActions.renderMath(this, document);
  }

  /**
   * @override
   */
   rerender(document, start = STATE.RERENDER) {
    if (this.state() >= start) {
      this.state(start - 1);
    }
    document.renderActions.renderMath(this, document, start);
  }

  /**
   * @override
   */
   convert(document, end = STATE.LAST) {
    document.renderActions.renderConvert(this, document, end);
  }

  /**
   * @override
   */
   compile(document) {
    if (this.state() < STATE.COMPILED) {
      this.root = this.inputJax.compile(this, document);
      this.state(STATE.COMPILED);
    }
  }

  /**
   * @override
   */
   typeset(document) {
    if (this.state() < STATE.TYPESET) {
      this.typesetRoot = document.outputJax[this.isEscaped ? 'escaped' : 'typeset'](this, document);
      this.state(STATE.TYPESET);
    }
  }

  /**
   * @override
   */
   updateDocument(_document) {}

  /**
   * @override
   */
   removeFromDocument(_restore = false) {}

  /**
   * @override
   */
   setMetrics(em, ex, cwidth, lwidth, scale) {
    this.metrics = {
      em: em, ex: ex,
      containerWidth: cwidth,
      lineWidth: lwidth,
      scale: scale
    };
  }

  /**
   * @override
   */
   state(state = null, restore = false) {
    if (state != null) {
      if (state < STATE.INSERTED && this._state >= STATE.INSERTED) {
        this.removeFromDocument(restore);
      }
      if (state < STATE.TYPESET && this._state >= STATE.TYPESET) {
        this.outputData = {};
      }
      if (state < STATE.COMPILED && this._state >= STATE.COMPILED) {
        this.inputData = {};
      }
      this._state = state;
    }
    return this._state;
  }

  /**
   * @override
   */
   reset(restore = false) {
    this.state(STATE.UNPROCESSED, restore);
  }

}

/*****************************************************************/
/**
 * The various states that a MathItem (or MathDocument) can be in
 *   (open-ended so that extensions can add to it)
 */
const STATE = {
  UNPROCESSED: 0,
  FINDMATH: 10,
  COMPILED: 20,
  CONVERT: 100,
  METRICS: 110,
  RERENDER: 125,
  TYPESET: 150,
  INSERTED: 200,
  LAST: 10000
};

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  The generic Factory class for creating arbitrary objects
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

/*****************************************************************/
/**
 * The Factory node interfaces (one for the node instance, one for the node class)
 */




















































































/*****************************************************************/
/**
 * The generic AbstractFactory class
 *
 * @template N  The node type created by the factory
 * @template C  The class of the node being constructed (for access to static properties)
 */
class AbstractFactory {

  /**
   * The default collection of objects to use for the node map
   */
   static __initStatic() {this.defaultNodes = {};}

  /**
   * The default kind
   */
   __init() {this.defaultKind = 'unknown';}

  /**
   * The map of node kinds to node classes
   */
   __init2() {this.nodeMap = new Map();}

  /**
   * An object containing functions for creating the various node kinds
   */
   __init3() {this.node = {};}

  /**
   * @override
   */
  constructor(nodes = null) {AbstractFactory.prototype.__init.call(this);AbstractFactory.prototype.__init2.call(this);AbstractFactory.prototype.__init3.call(this);
    if (nodes === null) {
      nodes = (this.constructor ).defaultNodes;
    }
    for (const kind of Object.keys(nodes)) {
      this.setNodeClass(kind, nodes[kind]);
    }
  }

  /**
   * @override
   */
   create(kind, ...args) {
    return (this.node[kind] || this.node[this.defaultKind])(...args);
  }

  /**
   * @override
   */
   setNodeClass(kind, nodeClass) {
    this.nodeMap.set(kind, nodeClass);
    let THIS = this;
    let KIND = this.nodeMap.get(kind);
    this.node[kind] = (...args) => {
      return new KIND(THIS, ...args);
    };
  }
  /**
   * @override
   */
   getNodeClass(kind) {
    return this.nodeMap.get(kind);
  }

  /**
   * @override
   */
   deleteNodeClass(kind) {
    this.nodeMap.delete(kind);
    delete this.node[kind];
  }

  /**
   * @override
   */
   nodeIsKind(node, kind) {
    return (node instanceof this.getNodeClass(kind));
  }

  /**
   * @override
   */
   getKinds() {
    return Array.from(this.nodeMap.keys());
  }

} AbstractFactory.__initStatic();

/*****************************************************************/
/**
 * The NodeFactory interface
 *
 * @template N  The node type created by the factory
 * @template C  The class of the node being constructed (for access to static properties)
 */










/*****************************************************************/
/**
 * The generic NodeFactory class
 *
 * @template N  The node type created by the factory
 * @template C  The class of the node being constructed (for access to static properties)
 */
class AbstractNodeFactory extends AbstractFactory {
  /**
   * @override
   */
   create(kind, properties = {}, children = []) {
    return this.node[kind](properties, children);
  }

}

/*****************************************************************/
/**
 *  Implements the MmlMath node class (subclass of AbstractMmlLayoutNode)
 */

class MmlMath extends AbstractMmlLayoutNode {

  /**
   *  These are used as the defaults for any attributes marked INHERIT in other classes
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlLayoutNode.defaults,
    mathvariant: 'normal',
    mathsize: 'normal',
    mathcolor: '', // Should be 'black', but allow it to inherit from surrounding text
    mathbackground: 'transparent',
    dir: 'ltr',
    scriptlevel: 0,
    displaystyle: false,
    display: 'inline',
    maxwidth: '',
    overflow: 'linebreak',
    altimg: '',
    'altimg-width': '',
    'altimg-height': '',
    'altimg-valign': '',
    alttext: '',
    cdgroup: '',
    scriptsizemultiplier: 1 / Math.sqrt(2),
    scriptminsize: '8px',        // Should be 8pt, but that's too big
    infixlinebreakstyle: 'before',
    lineleading: '1ex',
    linebreakmultchar: '\u2062', // Invisible times
    indentshift: 'auto',         // Use user configuration
    indentalign: 'auto',
    indenttarget: '',
    indentalignfirst: 'indentalign',
    indentshiftfirst: 'indentshift',
    indentalignlast:  'indentalign',
    indentshiftlast:  'indentshift'
  };}

  /**
   * @override
   */
   get kind() {
    return 'math';
  }

  /**
   * Linebreaking can occur in math nodes
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * The attributes of math nodes are inherited, so add them into the list.
   * The displaystyle attribute comes from the display attribute if not given explicitly
   * The scriptlevel comes from the scriptlevel attribute or default
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    if (this.attributes.get('mode') === 'display') {
      this.attributes.setInherited('display', 'block');
    }
    attributes = this.addInheritedAttributes(attributes, this.attributes.getAllAttributes());
    display = (!!this.attributes.get('displaystyle') ||
               (!this.attributes.get('displaystyle') && this.attributes.get('display') === 'block'));
    this.attributes.setInherited('displaystyle', display);
    level = (this.attributes.get('scriptlevel') ||
             (this.constructor ).defaults['scriptlevel']) ;
    super.setChildInheritedAttributes(attributes, display, level, prime);
  }

} MmlMath.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMi node class (subclass of AbstractMmlTokenNode)
 */

class MmlMi extends AbstractMmlTokenNode {constructor(...args) { super(...args); MmlMi.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlTokenNode.defaults
  };}

  /**
   * Pattern for operator names
   */
   static __initStatic2() {this.operatorName = /^[a-z][a-z0-9]*$/i;}
  /**
   * Pattern for single-character texts
   */
   static __initStatic3() {this.singleCharacter = /^[\uD800-\uDBFF]?.$/;}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'mi';
  }

  /**
   * Do the usual inheritance, then check the text length to see
   *   if mathvariant should be normal or italic.
   *
   * @override
   */
   setInheritedAttributes(attributes = {},
                                display = false, level = 0, prime = false) {
    super.setInheritedAttributes(attributes, display, level, prime);
    let text = this.getText();
    if (text.match(MmlMi.singleCharacter) && !attributes.mathvariant) {
      this.attributes.setInherited('mathvariant', 'italic');
    }
  }

  /**
   * Mark multi-character texts as OP rather than ORD for spacing purposes
   *
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    let name = this.getText();
    if (name.length > 1 && name.match(MmlMi.operatorName) && this.texClass === TEXCLASS.ORD) {
      this.texClass = TEXCLASS.OP;
      this.setProperty('autoOP', true);
    }
    return this;
  }

} MmlMi.__initStatic(); MmlMi.__initStatic2(); MmlMi.__initStatic3();

/*****************************************************************/
/**
 *  Implements the MmlMn node class (subclass of AbstractMmlTokenNode)
 */

class MmlMn extends AbstractMmlTokenNode {constructor(...args) { super(...args); MmlMn.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlTokenNode.defaults
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'mn';
  }

} MmlMn.__initStatic();

/**
 * Types needed for the operator dictionary
 */




/**
 * @param {number} lspace            The operator's MathML left-hand spacing
 * @param {number} rspace            The operator's MathML right-hand spacing
 * @param {number} texClass          The default TeX class for the operator
 * @param {PropertyList} properties  Any default properties from the operator dictionary
 * @return {OperatorDef}             The operator definition array
 */
function OPDEF(lspace, rspace, texClass = TEXCLASS.BIN,
                      properties = null) {
                        return [lspace, rspace, texClass, properties] ;
                      }

/**
 *  The various kinds of operators in the dictionary
 */
const MO = {
  ORD:        OPDEF(0, 0, TEXCLASS.ORD),
  ORD11:      OPDEF(1, 1, TEXCLASS.ORD),
  ORD21:      OPDEF(2, 1, TEXCLASS.ORD),
  ORD02:      OPDEF(0, 2, TEXCLASS.ORD),
  ORD55:      OPDEF(5, 5, TEXCLASS.ORD),
  OP:         OPDEF(1, 2, TEXCLASS.OP, {largeop: true, movablelimits: true, symmetric: true}),
  OPFIXED:    OPDEF(1, 2, TEXCLASS.OP, {largeop: true, movablelimits: true}),
  INTEGRAL:   OPDEF(0, 1, TEXCLASS.OP, {largeop: true, symmetric: true}),
  INTEGRAL2:  OPDEF(1, 2, TEXCLASS.OP, {largeop: true, symmetric: true}),
  BIN3:       OPDEF(3, 3, TEXCLASS.BIN),
  BIN4:       OPDEF(4, 4, TEXCLASS.BIN),
  BIN01:      OPDEF(0, 1, TEXCLASS.BIN),
  BIN5:       OPDEF(5, 5, TEXCLASS.BIN),
  TALLBIN:    OPDEF(4, 4, TEXCLASS.BIN, {stretchy: true}),
  BINOP:      OPDEF(4, 4, TEXCLASS.BIN, {largeop: true, movablelimits: true}),
  REL:        OPDEF(5, 5, TEXCLASS.REL),
  REL1:       OPDEF(1, 1, TEXCLASS.REL, {stretchy: true}),
  REL4:       OPDEF(4, 4, TEXCLASS.REL),
  RELSTRETCH: OPDEF(5, 5, TEXCLASS.REL, {stretchy: true}),
  RELACCENT:  OPDEF(5, 5, TEXCLASS.REL, {accent: true}),
  WIDEREL:    OPDEF(5, 5, TEXCLASS.REL, {accent: true, stretchy: true}),
  OPEN:       OPDEF(0, 0, TEXCLASS.OPEN, {fence: true, stretchy: true, symmetric: true}),
  CLOSE:      OPDEF(0, 0, TEXCLASS.CLOSE, {fence: true, stretchy: true, symmetric: true}),
  INNER:      OPDEF(0, 0, TEXCLASS.INNER),
  PUNCT:      OPDEF(0, 3, TEXCLASS.PUNCT),
  ACCENT:     OPDEF(0, 0, TEXCLASS.ORD, {accent: true}),
  WIDEACCENT: OPDEF(0, 0, TEXCLASS.ORD, {accent: true, stretchy: true})
};

/**
 *  The default TeX classes for the various unicode blocks, and their names
 */
const RANGES = [
  [0x20, 0x7F, TEXCLASS.REL, 'BasicLatin'],
  [0xA0, 0xFF, TEXCLASS.ORD, 'Latin1Supplement'],
  [0x100, 0x17F, TEXCLASS.ORD, 'LatinExtendedA'],
  [0x180, 0x24F, TEXCLASS.ORD, 'LatinExtendedB'],
  [0x2B0, 0x2FF, TEXCLASS.ORD, 'SpacingModLetters'],
  [0x300, 0x36F, TEXCLASS.ORD, 'CombDiacritMarks'],
  [0x370, 0x3FF, TEXCLASS.ORD, 'GreekAndCoptic'],
  [0x1E00, 0x1EFF, TEXCLASS.ORD, 'LatinExtendedAdditional'],
  [0x2000, 0x206F, TEXCLASS.PUNCT, 'GeneralPunctuation'],
  [0x2070, 0x209F, TEXCLASS.ORD, 'SuperAndSubscripts'],
  [0x20A0, 0x20CF, TEXCLASS.ORD, 'Currency'],
  [0x20D0, 0x20FF, TEXCLASS.ORD, 'CombDiactForSymbols'],
  [0x2100, 0x214F, TEXCLASS.ORD, 'LetterlikeSymbols'],
  [0x2150, 0x218F, TEXCLASS.ORD, 'NumberForms'],
  [0x2190, 0x21FF, TEXCLASS.REL, 'Arrows'],
  [0x2200, 0x22FF, TEXCLASS.BIN, 'MathOperators'],
  [0x2300, 0x23FF, TEXCLASS.ORD, 'MiscTechnical'],
  [0x2460, 0x24FF, TEXCLASS.ORD, 'EnclosedAlphaNums'],
  [0x2500, 0x259F, TEXCLASS.ORD, 'BoxDrawing'],
  [0x25A0, 0x25FF, TEXCLASS.ORD, 'GeometricShapes'],
  [0x2700, 0x27BF, TEXCLASS.ORD, 'Dingbats'],
  [0x27C0, 0x27EF, TEXCLASS.ORD, 'MiscMathSymbolsA'],
  [0x27F0, 0x27FF, TEXCLASS.REL, 'SupplementalArrowsA'],
  [0x2900, 0x297F, TEXCLASS.REL, 'SupplementalArrowsB'],
  [0x2980, 0x29FF, TEXCLASS.ORD, 'MiscMathSymbolsB'],
  [0x2A00, 0x2AFF, TEXCLASS.BIN, 'SuppMathOperators'],
  [0x2B00, 0x2BFF, TEXCLASS.ORD, 'MiscSymbolsAndArrows'],
  [0x1D400, 0x1D7FF, TEXCLASS.ORD, 'MathAlphabets']
];

/**
 * The default MathML spacing for the various TeX classes.
 */
const MMLSPACING = [
  [0, 0],  // ORD
  [1, 2],  // OP
  [3, 3],  // BIN
  [4, 4],  // REL
  [0, 0],  // OPEN
  [0, 0],  // CLOSE
  [0, 3]   // PUNCT
];

/**
 *  The operator dictionary, with sections for the three forms:  prefix, postfix, and infix
 */
const OPTABLE = {
  prefix: {
    '(': MO.OPEN,            // left parenthesis
    '+': MO.BIN01,           // plus sign
    '-': MO.BIN01,           // hyphen-minus
    '[': MO.OPEN,            // left square bracket
    '{': MO.OPEN,            // left curly bracket
    '|': MO.OPEN,            // vertical line
    '||': [0, 0, TEXCLASS.BIN, {fence: true, stretchy: true, symmetric: true}], // multiple character operator: ||
    '|||': [0, 0, TEXCLASS.ORD, {fence: true, stretchy: true, symmetric: true}], // multiple character operator: |||
    '\u00AC': MO.ORD21,      // not sign
    '\u00B1': MO.BIN01,      // plus-minus sign
    '\u2016': [0, 0, TEXCLASS.ORD, {fence: true, stretchy: true}], // double vertical line
    '\u2018': [0, 0, TEXCLASS.OPEN, {fence: true}], // left single quotation mark
    '\u201C': [0, 0, TEXCLASS.OPEN, {fence: true}], // left double quotation mark
    '\u2145': MO.ORD21,      // double-struck italic capital d
    '\u2146': OPDEF(2, 0, TEXCLASS.ORD),  // double-struck italic small d
    '\u2200': MO.ORD21,      // for all
    '\u2202': MO.ORD21,      // partial differential
    '\u2203': MO.ORD21,      // there exists
    '\u2204': MO.ORD21,      // there does not exist
    '\u2207': MO.ORD21,      // nabla
    '\u220F': MO.OP,         // n-ary product
    '\u2210': MO.OP,         // n-ary coproduct
    '\u2211': MO.OP,         // n-ary summation
    '\u2212': MO.BIN01,      // minus sign
    '\u2213': MO.BIN01,      // minus-or-plus sign
    '\u221A': [1, 1, TEXCLASS.ORD, {stretchy: true}], // square root
    '\u221B': MO.ORD11,      // cube root
    '\u221C': MO.ORD11,      // fourth root
    '\u2220': MO.ORD,        // angle
    '\u2221': MO.ORD,        // measured angle
    '\u2222': MO.ORD,        // spherical angle
    '\u222B': MO.INTEGRAL,   // integral
    '\u222C': MO.INTEGRAL,   // double integral
    '\u222D': MO.INTEGRAL,   // triple integral
    '\u222E': MO.INTEGRAL,   // contour integral
    '\u222F': MO.INTEGRAL,   // surface integral
    '\u2230': MO.INTEGRAL,   // volume integral
    '\u2231': MO.INTEGRAL,   // clockwise integral
    '\u2232': MO.INTEGRAL,   // clockwise contour integral
    '\u2233': MO.INTEGRAL,   // anticlockwise contour integral
    '\u22C0': MO.OP,         // n-ary logical and
    '\u22C1': MO.OP,         // n-ary logical or
    '\u22C2': MO.OP,         // n-ary intersection
    '\u22C3': MO.OP,         // n-ary union
    '\u2308': MO.OPEN,       // left ceiling
    '\u230A': MO.OPEN,       // left floor
    '\u2772': MO.OPEN,       // light left tortoise shell bracket ornament
    '\u27E6': MO.OPEN,       // mathematical left white square bracket
    '\u27E8': MO.OPEN,       // mathematical left angle bracket
    '\u27EA': MO.OPEN,       // mathematical left double angle bracket
    '\u27EC': MO.OPEN,       // mathematical left white tortoise shell bracket
    '\u27EE': MO.OPEN,       // mathematical left flattened parenthesis
    '\u2980': [0, 0, TEXCLASS.ORD, {fence: true, stretchy: true}], // triple vertical bar delimiter
    '\u2983': MO.OPEN,       // left white curly bracket
    '\u2985': MO.OPEN,       // left white parenthesis
    '\u2987': MO.OPEN,       // z notation left image bracket
    '\u2989': MO.OPEN,       // z notation left binding bracket
    '\u298B': MO.OPEN,       // left square bracket with underbar
    '\u298D': MO.OPEN,       // left square bracket with tick in top corner
    '\u298F': MO.OPEN,       // left square bracket with tick in bottom corner
    '\u2991': MO.OPEN,       // left angle bracket with dot
    '\u2993': MO.OPEN,       // left arc less-than bracket
    '\u2995': MO.OPEN,       // double left arc greater-than bracket
    '\u2997': MO.OPEN,       // left black tortoise shell bracket
    '\u29FC': MO.OPEN,       // left-pointing curved angle bracket
    '\u2A00': MO.OP,         // n-ary circled dot operator
    '\u2A01': MO.OP,         // n-ary circled plus operator
    '\u2A02': MO.OP,         // n-ary circled times operator
    '\u2A03': MO.OP,         // n-ary union operator with dot
    '\u2A04': MO.OP,         // n-ary union operator with plus
    '\u2A05': MO.OP,         // n-ary square intersection operator
    '\u2A06': MO.OP,         // n-ary square union operator
    '\u2A07': MO.OP,         // two logical and operator
    '\u2A08': MO.OP,         // two logical or operator
    '\u2A09': MO.OP,         // n-ary times operator
    '\u2A0A': MO.OP,         // modulo two sum
    '\u2A0B': MO.INTEGRAL2,  // summation with integral
    '\u2A0C': MO.INTEGRAL,   // quadruple integral operator
    '\u2A0D': MO.INTEGRAL2,  // finite part integral
    '\u2A0E': MO.INTEGRAL2,  // integral with double stroke
    '\u2A0F': MO.INTEGRAL2,  // integral average with slash
    '\u2A10': MO.OP,         // circulation function
    '\u2A11': MO.OP,         // anticlockwise integration
    '\u2A12': MO.OP,         // line integration with rectangular path around pole
    '\u2A13': MO.OP,         // line integration with semicircular path around pole
    '\u2A14': MO.OP,         // line integration not including the pole
    '\u2A15': MO.INTEGRAL2,  // integral around a point operator
    '\u2A16': MO.INTEGRAL2,  // quaternion integral operator
    '\u2A17': MO.INTEGRAL2,  // integral with leftwards arrow with hook
    '\u2A18': MO.INTEGRAL2,  // integral with times sign
    '\u2A19': MO.INTEGRAL2,  // integral with intersection
    '\u2A1A': MO.INTEGRAL2,  // integral with union
    '\u2A1B': MO.INTEGRAL2,  // integral with overbar
    '\u2A1C': MO.INTEGRAL2,  // integral with underbar
    '\u2AFC': MO.OP,         // large triple vertical bar operator
    '\u2AFF': MO.OP,         // n-ary white vertical bar
  },
  postfix: {
    '!!': OPDEF(1, 0),       // multiple character operator: !!
    '!': [1, 0, TEXCLASS.CLOSE, null], // exclamation mark
    '&': MO.ORD,             // ampersand
    ')': MO.CLOSE,           // right parenthesis
    '++': OPDEF(0, 0),       // multiple character operator: ++
    '--': OPDEF(0, 0),       // multiple character operator: --
    '..': OPDEF(0, 0),       // multiple character operator: ..
    '...': MO.ORD,           // multiple character operator: ...
    '\'': MO.ACCENT,         // apostrophe
    ']': MO.CLOSE,           // right square bracket
    '^': MO.WIDEACCENT,      // circumflex accent
    '_': MO.WIDEACCENT,      // low line
    '`': MO.ACCENT,          // grave accent
    '|': MO.CLOSE,           // vertical line
    '}': MO.CLOSE,           // right curly bracket
    '~': MO.WIDEACCENT,      // tilde
    '||': [0, 0, TEXCLASS.BIN, {fence: true, stretchy: true, symmetric: true}], // multiple character operator: ||
    '|||': [0, 0, TEXCLASS.ORD, {fence: true, stretchy: true, symmetric: true}], // multiple character operator: |||
    '\u00A8': MO.ACCENT,     // diaeresis
    '\u00AF': MO.WIDEACCENT, // macron
    '\u00B0': MO.ORD,        // degree sign
    '\u00B4': MO.ACCENT,     // acute accent
    '\u00B8': MO.ACCENT,     // cedilla
    '\u02C6': MO.WIDEACCENT, // modifier letter circumflex accent
    '\u02C7': MO.WIDEACCENT, // caron
    '\u02C9': MO.WIDEACCENT, // modifier letter macron
    '\u02CA': MO.ACCENT,     // modifier letter acute accent
    '\u02CB': MO.ACCENT,     // modifier letter grave accent
    '\u02CD': MO.WIDEACCENT, // modifier letter low macron
    '\u02D8': MO.ACCENT,     // breve
    '\u02D9': MO.ACCENT,     // dot above
    '\u02DA': MO.ACCENT,     // ring above
    '\u02DC': MO.WIDEACCENT, // small tilde
    '\u02DD': MO.ACCENT,     // double acute accent
    '\u02F7': MO.WIDEACCENT, // modifier letter low tilde
    '\u0302': MO.WIDEACCENT, // combining circumflex accent
    '\u0311': MO.ACCENT,     // combining inverted breve
    '\u03F6': MO.REL,        // greek reversed lunate epsilon symbol
    '\u2016': [0, 0, TEXCLASS.ORD, {fence: true, stretchy: true}], // double vertical line
    '\u2019': [0, 0, TEXCLASS.CLOSE, {fence: true}], // right single quotation mark
    '\u201D': [0, 0, TEXCLASS.CLOSE, {fence: true}],  // right double quotation mark
    '\u2032': MO.ORD02,      // prime
    '\u203E': MO.WIDEACCENT, // overline
    '\u20DB': MO.ACCENT,     // combining three dots above
    '\u20DC': MO.ACCENT,     // combining four dots above
    '\u2309': MO.CLOSE,      // right ceiling
    '\u230B': MO.CLOSE,      // right floor
    '\u23B4': MO.WIDEACCENT, // top square bracket
    '\u23B5': MO.WIDEACCENT, // bottom square bracket
    '\u23DC': MO.WIDEACCENT, // top parenthesis
    '\u23DD': MO.WIDEACCENT, // bottom parenthesis
    '\u23DE': MO.WIDEACCENT, // top curly bracket
    '\u23DF': MO.WIDEACCENT, // bottom curly bracket
    '\u23E0': MO.WIDEACCENT, // top tortoise shell bracket
    '\u23E1': MO.WIDEACCENT, // bottom tortoise shell bracket
    '\u25A0': MO.BIN3,       // black square
    '\u25A1': MO.BIN3,       // white square
    '\u25AA': MO.BIN3,       // black small square
    '\u25AB': MO.BIN3,       // white small square
    '\u25AD': MO.BIN3,       // white rectangle
    '\u25AE': MO.BIN3,       // black vertical rectangle
    '\u25AF': MO.BIN3,       // white vertical rectangle
    '\u25B0': MO.BIN3,       // black parallelogram
    '\u25B1': MO.BIN3,       // white parallelogram
    '\u25B2': MO.BIN4,       // black up-pointing triangle
    '\u25B4': MO.BIN4,       // black up-pointing small triangle
    '\u25B6': MO.BIN4,       // black right-pointing triangle
    '\u25B7': MO.BIN4,       // white right-pointing triangle
    '\u25B8': MO.BIN4,       // black right-pointing small triangle
    '\u25BC': MO.BIN4,       // black down-pointing triangle
    '\u25BE': MO.BIN4,       // black down-pointing small triangle
    '\u25C0': MO.BIN4,       // black left-pointing triangle
    '\u25C1': MO.BIN4,       // white left-pointing triangle
    '\u25C2': MO.BIN4,       // black left-pointing small triangle
    '\u25C4': MO.BIN4,       // black left-pointing pointer
    '\u25C5': MO.BIN4,       // white left-pointing pointer
    '\u25C6': MO.BIN4,       // black diamond
    '\u25C7': MO.BIN4,       // white diamond
    '\u25C8': MO.BIN4,       // white diamond containing black small diamond
    '\u25C9': MO.BIN4,       // fisheye
    '\u25CC': MO.BIN4,       // dotted circle
    '\u25CD': MO.BIN4,       // circle with vertical fill
    '\u25CE': MO.BIN4,       // bullseye
    '\u25CF': MO.BIN4,       // black circle
    '\u25D6': MO.BIN4,       // left half black circle
    '\u25D7': MO.BIN4,       // right half black circle
    '\u25E6': MO.BIN4,       // white bullet
    '\u266D': MO.ORD02,      // music flat sign
    '\u266E': MO.ORD02,      // music natural sign
    '\u266F': MO.ORD02,      // music sharp sign
    '\u2773': MO.CLOSE,      // light right tortoise shell bracket ornament
    '\u27E7': MO.CLOSE,      // mathematical right white square bracket
    '\u27E9': MO.CLOSE,      // mathematical right angle bracket
    '\u27EB': MO.CLOSE,      // mathematical right double angle bracket
    '\u27ED': MO.CLOSE,      // mathematical right white tortoise shell bracket
    '\u27EF': MO.CLOSE,      // mathematical right flattened parenthesis
    '\u2980': [0, 0, TEXCLASS.ORD, {fence: true, stretchy: true}], // triple vertical bar delimiter
    '\u2984': MO.CLOSE,      // right white curly bracket
    '\u2986': MO.CLOSE,      // right white parenthesis
    '\u2988': MO.CLOSE,      // z notation right image bracket
    '\u298A': MO.CLOSE,      // z notation right binding bracket
    '\u298C': MO.CLOSE,      // right square bracket with underbar
    '\u298E': MO.CLOSE,      // right square bracket with tick in bottom corner
    '\u2990': MO.CLOSE,      // right square bracket with tick in top corner
    '\u2992': MO.CLOSE,      // right angle bracket with dot
    '\u2994': MO.CLOSE,      // right arc greater-than bracket
    '\u2996': MO.CLOSE,      // double right arc less-than bracket
    '\u2998': MO.CLOSE,      // right black tortoise shell bracket
    '\u29FD': MO.CLOSE,      // right-pointing curved angle bracket
  },
  infix: {
    '!=': MO.BIN4,           // multiple character operator: !=
    '#': MO.ORD,             // #
    '$': MO.ORD,             // $
    '%': [3, 3, TEXCLASS.ORD, null], // percent sign
    '&&': MO.BIN4,           // multiple character operator: &&
    '': MO.ORD,              // empty <mo>
    '*': MO.BIN3,            // asterisk
    '**': OPDEF(1, 1),       // multiple character operator: **
    '*=': MO.BIN4,           // multiple character operator: *=
    '+': MO.BIN4,            // plus sign
    '+=': MO.BIN4,           // multiple character operator: +=
    ',': [0, 3, TEXCLASS.PUNCT, {linebreakstyle: 'after', separator: true}], // comma
    '-': MO.BIN4,            // hyphen-minus
    '-=': MO.BIN4,           // multiple character operator: -=
    '->': MO.BIN5,           // multiple character operator: ->
    '.': [0, 3, TEXCLASS.PUNCT, {separator: true}], // \ldotp
    '/': MO.ORD11,           // solidus
    '//': OPDEF(1, 1),       // multiple character operator: //
    '/=': MO.BIN4,           // multiple character operator: /=
    ':': [1, 2, TEXCLASS.REL, null], // colon
    ':=': MO.BIN4,           // multiple character operator: :=
    ';': [0, 3, TEXCLASS.PUNCT, {linebreakstyle: 'after', separator: true}], // semicolon
    '<': MO.REL,             // less-than sign
    '<=': MO.BIN5,           // multiple character operator: <=
    '<>': OPDEF(1, 1),       // multiple character operator: <>
    '=': MO.REL,             // equals sign
    '==': MO.BIN4,           // multiple character operator: ==
    '>': MO.REL,             // greater-than sign
    '>=': MO.BIN5,           // multiple character operator: >=
    '?': [1, 1, TEXCLASS.CLOSE, null], // question mark
    '@': MO.ORD11,           // commercial at
    '\\': MO.ORD,            // reverse solidus
    '^': MO.ORD11,           // circumflex accent
    '_': MO.ORD11,           // low line
    '|': [2, 2, TEXCLASS.ORD, {fence: true, stretchy: true, symmetric: true}], // vertical line
    '||': [2, 2, TEXCLASS.BIN, {fence: true, stretchy: true, symmetric: true}], // multiple character operator: ||
    '|||': [2, 2, TEXCLASS.ORD, {fence: true, stretchy: true, symmetric: true}], // multiple character operator: |||
    '\u00B1': MO.BIN4,       // plus-minus sign
    '\u00B7': MO.BIN4,       // middle dot
    '\u00D7': MO.BIN4,       // multiplication sign
    '\u00F7': MO.BIN4,       // division sign
    '\u02B9': MO.ORD,        // prime
    '\u0300': MO.ACCENT,     // \grave
    '\u0301': MO.ACCENT,     // \acute
    '\u0303': MO.WIDEACCENT, // \tilde
    '\u0304': MO.ACCENT,     // \bar
    '\u0306': MO.ACCENT,     // \breve
    '\u0307': MO.ACCENT,     // \dot
    '\u0308': MO.ACCENT,     // \ddot
    '\u030C': MO.ACCENT,     // \check
    '\u0332': MO.WIDEACCENT, // horizontal line
    '\u0338': MO.REL4,       // \not
    '\u2015': [0, 0, TEXCLASS.ORD, {stretchy: true}], // horizontal line
    '\u2017': [0, 0, TEXCLASS.ORD, {stretchy: true}], // horizontal line
    '\u2020': MO.BIN3,       // \dagger
    '\u2021': MO.BIN3,       // \ddagger
    '\u2022': MO.BIN4,       // bullet
    '\u2026': MO.INNER,      // horizontal ellipsis
    '\u2044': MO.TALLBIN,    // fraction slash
    '\u2061': MO.ORD,        // function application
    '\u2062': MO.ORD,        // invisible times
    '\u2063': [0, 0, TEXCLASS.ORD, {linebreakstyle: 'after', separator: true}], // invisible separator
    '\u2064': MO.ORD,        // invisible plus
    '\u20D7': MO.ACCENT,     // \vec
    '\u2111': MO.ORD,        // \Im
    '\u2113': MO.ORD,        // \ell
    '\u2118': MO.ORD,        // \wp
    '\u211C': MO.ORD,        // \Re
    '\u2190': MO.WIDEREL,    // leftwards arrow
    '\u2191': MO.RELSTRETCH, // upwards arrow
    '\u2192': MO.WIDEREL,    // rightwards arrow
    '\u2193': MO.RELSTRETCH, // downwards arrow
    '\u2194': MO.WIDEREL,    // left right arrow
    '\u2195': MO.RELSTRETCH, // up down arrow
    '\u2196': MO.RELSTRETCH, // north west arrow
    '\u2197': MO.RELSTRETCH, // north east arrow
    '\u2198': MO.RELSTRETCH, // south east arrow
    '\u2199': MO.RELSTRETCH, // south west arrow
    '\u219A': MO.RELACCENT,  // leftwards arrow with stroke
    '\u219B': MO.RELACCENT,  // rightwards arrow with stroke
    '\u219C': MO.WIDEREL,    // leftwards wave arrow
    '\u219D': MO.WIDEREL,    // rightwards wave arrow
    '\u219E': MO.WIDEREL,    // leftwards two headed arrow
    '\u219F': MO.WIDEREL,    // upwards two headed arrow
    '\u21A0': MO.WIDEREL,    // rightwards two headed arrow
    '\u21A1': MO.RELSTRETCH, // downwards two headed arrow
    '\u21A2': MO.WIDEREL,    // leftwards arrow with tail
    '\u21A3': MO.WIDEREL,    // rightwards arrow with tail
    '\u21A4': MO.WIDEREL,    // leftwards arrow from bar
    '\u21A5': MO.RELSTRETCH, // upwards arrow from bar
    '\u21A6': MO.WIDEREL,    // rightwards arrow from bar
    '\u21A7': MO.RELSTRETCH, // downwards arrow from bar
    '\u21A8': MO.RELSTRETCH, // up down arrow with base
    '\u21A9': MO.WIDEREL,    // leftwards arrow with hook
    '\u21AA': MO.WIDEREL,    // rightwards arrow with hook
    '\u21AB': MO.WIDEREL,    // leftwards arrow with loop
    '\u21AC': MO.WIDEREL,    // rightwards arrow with loop
    '\u21AD': MO.WIDEREL,    // left right wave arrow
    '\u21AE': MO.RELACCENT,  // left right arrow with stroke
    '\u21AF': MO.RELSTRETCH, // downwards zigzag arrow
    '\u21B0': MO.RELSTRETCH, // upwards arrow with tip leftwards
    '\u21B1': MO.RELSTRETCH, // upwards arrow with tip rightwards
    '\u21B2': MO.RELSTRETCH, // downwards arrow with tip leftwards
    '\u21B3': MO.RELSTRETCH, // downwards arrow with tip rightwards
    '\u21B4': MO.RELSTRETCH, // rightwards arrow with corner downwards
    '\u21B5': MO.RELSTRETCH, // downwards arrow with corner leftwards
    '\u21B6': MO.RELACCENT,  // anticlockwise top semicircle arrow
    '\u21B7': MO.RELACCENT,  // clockwise top semicircle arrow
    '\u21B8': MO.REL,        // north west arrow to long bar
    '\u21B9': MO.WIDEREL,    // leftwards arrow to bar over rightwards arrow to bar
    '\u21BA': MO.REL,        // anticlockwise open circle arrow
    '\u21BB': MO.REL,        // clockwise open circle arrow
    '\u21BC': MO.WIDEREL,    // leftwards harpoon with barb upwards
    '\u21BD': MO.WIDEREL,    // leftwards harpoon with barb downwards
    '\u21BE': MO.RELSTRETCH, // upwards harpoon with barb rightwards
    '\u21BF': MO.RELSTRETCH, // upwards harpoon with barb leftwards
    '\u21C0': MO.WIDEREL,    // rightwards harpoon with barb upwards
    '\u21C1': MO.WIDEREL,    // rightwards harpoon with barb downwards
    '\u21C2': MO.RELSTRETCH, // downwards harpoon with barb rightwards
    '\u21C3': MO.RELSTRETCH, // downwards harpoon with barb leftwards
    '\u21C4': MO.WIDEREL,    // rightwards arrow over leftwards arrow
    '\u21C5': MO.RELSTRETCH, // upwards arrow leftwards of downwards arrow
    '\u21C6': MO.WIDEREL,    // leftwards arrow over rightwards arrow
    '\u21C7': MO.WIDEREL,    // leftwards paired arrows
    '\u21C8': MO.RELSTRETCH, // upwards paired arrows
    '\u21C9': MO.WIDEREL,    // rightwards paired arrows
    '\u21CA': MO.RELSTRETCH, // downwards paired arrows
    '\u21CB': MO.WIDEREL,    // leftwards harpoon over rightwards harpoon
    '\u21CC': MO.WIDEREL,    // rightwards harpoon over leftwards harpoon
    '\u21CD': MO.RELACCENT,  // leftwards double arrow with stroke
    '\u21CE': MO.RELACCENT,  // left right double arrow with stroke
    '\u21CF': MO.RELACCENT,  // rightwards double arrow with stroke
    '\u21D0': MO.WIDEREL,    // leftwards double arrow
    '\u21D1': MO.RELSTRETCH, // upwards double arrow
    '\u21D2': MO.WIDEREL,    // rightwards double arrow
    '\u21D3': MO.RELSTRETCH, // downwards double arrow
    '\u21D4': MO.WIDEREL,    // left right double arrow
    '\u21D5': MO.RELSTRETCH, // up down double arrow
    '\u21D6': MO.RELSTRETCH, // north west double arrow
    '\u21D7': MO.RELSTRETCH, // north east double arrow
    '\u21D8': MO.RELSTRETCH, // south east double arrow
    '\u21D9': MO.RELSTRETCH, // south west double arrow
    '\u21DA': MO.WIDEREL,    // leftwards triple arrow
    '\u21DB': MO.WIDEREL,    // rightwards triple arrow
    '\u21DC': MO.WIDEREL,    // leftwards squiggle arrow
    '\u21DD': MO.WIDEREL,    // rightwards squiggle arrow
    '\u21DE': MO.REL,        // upwards arrow with double stroke
    '\u21DF': MO.REL,        // downwards arrow with double stroke
    '\u21E0': MO.WIDEREL,    // leftwards dashed arrow
    '\u21E1': MO.RELSTRETCH, // upwards dashed arrow
    '\u21E2': MO.WIDEREL,    // rightwards dashed arrow
    '\u21E3': MO.RELSTRETCH, // downwards dashed arrow
    '\u21E4': MO.WIDEREL,    // leftwards arrow to bar
    '\u21E5': MO.WIDEREL,    // rightwards arrow to bar
    '\u21E6': MO.WIDEREL,    // leftwards white arrow
    '\u21E7': MO.RELSTRETCH, // upwards white arrow
    '\u21E8': MO.WIDEREL,    // rightwards white arrow
    '\u21E9': MO.RELSTRETCH, // downwards white arrow
    '\u21EA': MO.RELSTRETCH, // upwards white arrow from bar
    '\u21EB': MO.RELSTRETCH, // upwards white arrow on pedestal
    '\u21EC': MO.RELSTRETCH, // upwards white arrow on pedestal with horizontal bar
    '\u21ED': MO.RELSTRETCH, // upwards white arrow on pedestal with vertical bar
    '\u21EE': MO.RELSTRETCH, // upwards white double arrow
    '\u21EF': MO.RELSTRETCH, // upwards white double arrow on pedestal
    '\u21F0': MO.WIDEREL,    // rightwards white arrow from wall
    '\u21F1': MO.REL,        // north west arrow to corner
    '\u21F2': MO.REL,        // south east arrow to corner
    '\u21F3': MO.RELSTRETCH, // up down white arrow
    '\u21F4': MO.RELACCENT,  // right arrow with small circle
    '\u21F5': MO.RELSTRETCH, // downwards arrow leftwards of upwards arrow
    '\u21F6': MO.WIDEREL,    // three rightwards arrows
    '\u21F7': MO.RELACCENT,  // leftwards arrow with vertical stroke
    '\u21F8': MO.RELACCENT,  // rightwards arrow with vertical stroke
    '\u21F9': MO.RELACCENT,  // left right arrow with vertical stroke
    '\u21FA': MO.RELACCENT,  // leftwards arrow with double vertical stroke
    '\u21FB': MO.RELACCENT,  // rightwards arrow with double vertical stroke
    '\u21FC': MO.RELACCENT,  // left right arrow with double vertical stroke
    '\u21FD': MO.WIDEREL,    // leftwards open-headed arrow
    '\u21FE': MO.WIDEREL,    // rightwards open-headed arrow
    '\u21FF': MO.WIDEREL,    // left right open-headed arrow
    '\u2201': OPDEF(1, 2, TEXCLASS.ORD), // complement
    '\u2205': MO.ORD,        // \emptyset
    '\u2206': MO.BIN3,       // increment
    '\u2208': MO.REL,        // element of
    '\u2209': MO.REL,        // not an element of
    '\u220A': MO.REL,        // small element of
    '\u220B': MO.REL,        // contains as member
    '\u220C': MO.REL,        // does not contain as member
    '\u220D': MO.REL,        // small contains as member
    '\u220E': MO.BIN3,       // end of proof
    '\u2212': MO.BIN4,       // minus sign
    '\u2213': MO.BIN4,       // minus-or-plus sign
    '\u2214': MO.BIN4,       // dot plus
    '\u2215': MO.TALLBIN,    // division slash
    '\u2216': MO.BIN4,       // set minus
    '\u2217': MO.BIN4,       // asterisk operator
    '\u2218': MO.BIN4,       // ring operator
    '\u2219': MO.BIN4,       // bullet operator
    '\u221D': MO.REL,        // proportional to
    '\u221E': MO.ORD,        // \infty
    '\u221F': MO.REL,        // right angle
    '\u2223': MO.REL,        // divides
    '\u2224': MO.REL,        // does not divide
    '\u2225': MO.REL,        // parallel to
    '\u2226': MO.REL,        // not parallel to
    '\u2227': MO.BIN4,       // logical and
    '\u2228': MO.BIN4,       // logical or
    '\u2229': MO.BIN4,       // intersection
    '\u222A': MO.BIN4,       // union
    '\u2234': MO.REL,        // therefore
    '\u2235': MO.REL,        // because
    '\u2236': MO.REL,        // ratio
    '\u2237': MO.REL,        // proportion
    '\u2238': MO.BIN4,       // dot minus
    '\u2239': MO.REL,        // excess
    '\u223A': MO.BIN4,       // geometric proportion
    '\u223B': MO.REL,        // homothetic
    '\u223C': MO.REL,        // tilde operator
    '\u223D': MO.REL,        // reversed tilde
    '\u223D\u0331': MO.BIN3, // reversed tilde with underline
    '\u223E': MO.REL,        // inverted lazy s
    '\u223F': MO.BIN3,       // sine wave
    '\u2240': MO.BIN4,       // wreath product
    '\u2241': MO.REL,        // not tilde
    '\u2242': MO.REL,        // minus tilde
    '\u2242\u0338': MO.REL,  // minus tilde with slash
    '\u2243': MO.REL,        // asymptotically equal to
    '\u2244': MO.REL,        // not asymptotically equal to
    '\u2245': MO.REL,        // approximately equal to
    '\u2246': MO.REL,        // approximately but not actually equal to
    '\u2247': MO.REL,        // neither approximately nor actually equal to
    '\u2248': MO.REL,        // almost equal to
    '\u2249': MO.REL,        // not almost equal to
    '\u224A': MO.REL,        // almost equal or equal to
    '\u224B': MO.REL,        // triple tilde
    '\u224C': MO.REL,        // all equal to
    '\u224D': MO.REL,        // equivalent to
    '\u224E': MO.REL,        // geometrically equivalent to
    '\u224E\u0338': MO.REL,  // geometrically equivalent to with slash
    '\u224F': MO.REL,        // difference between
    '\u224F\u0338': MO.REL,  // difference between with slash
    '\u2250': MO.REL,        // approaches the limit
    '\u2251': MO.REL,        // geometrically equal to
    '\u2252': MO.REL,        // approximately equal to or the image of
    '\u2253': MO.REL,        // image of or approximately equal to
    '\u2254': MO.REL,        // colon equals
    '\u2255': MO.REL,        // equals colon
    '\u2256': MO.REL,        // ring in equal to
    '\u2257': MO.REL,        // ring equal to
    '\u2258': MO.REL,        // corresponds to
    '\u2259': MO.REL,        // estimates
    '\u225A': MO.REL,        // equiangular to
    '\u225C': MO.REL,        // delta equal to
    '\u225D': MO.REL,        // equal to by definition
    '\u225E': MO.REL,        // measured by
    '\u225F': MO.REL,        // questioned equal to
    '\u2260': MO.REL,        // not equal to
    '\u2261': MO.REL,        // identical to
    '\u2262': MO.REL,        // not identical to
    '\u2263': MO.REL,        // strictly equivalent to
    '\u2264': MO.REL,        // less-than or equal to
    '\u2265': MO.REL,        // greater-than or equal to
    '\u2266': MO.REL,        // less-than over equal to
    '\u2266\u0338': MO.REL,  // less-than over equal to with slash
    '\u2267': MO.REL,        // greater-than over equal to
    '\u2268': MO.REL,        // less-than but not equal to
    '\u2269': MO.REL,        // greater-than but not equal to
    '\u226A': MO.REL,        // much less-than
    '\u226A\u0338': MO.REL,  // much less than with slash
    '\u226B': MO.REL,        // much greater-than
    '\u226B\u0338': MO.REL,  // much greater than with slash
    '\u226C': MO.REL,        // between
    '\u226D': MO.REL,        // not equivalent to
    '\u226E': MO.REL,        // not less-than
    '\u226F': MO.REL,        // not greater-than
    '\u2270': MO.REL,        // neither less-than nor equal to
    '\u2271': MO.REL,        // neither greater-than nor equal to
    '\u2272': MO.REL,        // less-than or equivalent to
    '\u2273': MO.REL,        // greater-than or equivalent to
    '\u2274': MO.REL,        // neither less-than nor equivalent to
    '\u2275': MO.REL,        // neither greater-than nor equivalent to
    '\u2276': MO.REL,        // less-than or greater-than
    '\u2277': MO.REL,        // greater-than or less-than
    '\u2278': MO.REL,        // neither less-than nor greater-than
    '\u2279': MO.REL,        // neither greater-than nor less-than
    '\u227A': MO.REL,        // precedes
    '\u227B': MO.REL,        // succeeds
    '\u227C': MO.REL,        // precedes or equal to
    '\u227D': MO.REL,        // succeeds or equal to
    '\u227E': MO.REL,        // precedes or equivalent to
    '\u227F': MO.REL,        // succeeds or equivalent to
    '\u227F\u0338': MO.REL,  // succeeds or equivalent to with slash
    '\u2280': MO.REL,        // does not precede
    '\u2281': MO.REL,        // does not succeed
    '\u2282': MO.REL,        // subset of
    '\u2282\u20D2': MO.REL,  // subset of with vertical line
    '\u2283': MO.REL,        // superset of
    '\u2283\u20D2': MO.REL,  // superset of with vertical line
    '\u2284': MO.REL,        // not a subset of
    '\u2285': MO.REL,        // not a superset of
    '\u2286': MO.REL,        // subset of or equal to
    '\u2287': MO.REL,        // superset of or equal to
    '\u2288': MO.REL,        // neither a subset of nor equal to
    '\u2289': MO.REL,        // neither a superset of nor equal to
    '\u228A': MO.REL,        // subset of with not equal to
    '\u228B': MO.REL,        // superset of with not equal to
    '\u228C': MO.BIN4,       // multiset
    '\u228D': MO.BIN4,       // multiset multiplication
    '\u228E': MO.BIN4,       // multiset union
    '\u228F': MO.REL,        // square image of
    '\u228F\u0338': MO.REL,  // square image of with slash
    '\u2290': MO.REL,        // square original of
    '\u2290\u0338': MO.REL,  // square original of with slash
    '\u2291': MO.REL,        // square image of or equal to
    '\u2292': MO.REL,        // square original of or equal to
    '\u2293': MO.BIN4,       // square cap
    '\u2294': MO.BIN4,       // square cup
    '\u2295': MO.BIN4,       // circled plus
    '\u2296': MO.BIN4,       // circled minus
    '\u2297': MO.BIN4,       // circled times
    '\u2298': MO.BIN4,       // circled division slash
    '\u2299': MO.BIN4,       // circled dot operator
    '\u229A': MO.BIN4,       // circled ring operator
    '\u229B': MO.BIN4,       // circled asterisk operator
    '\u229C': MO.BIN4,       // circled equals
    '\u229D': MO.BIN4,       // circled dash
    '\u229E': MO.BIN4,       // squared plus
    '\u229F': MO.BIN4,       // squared minus
    '\u22A0': MO.BIN4,       // squared times
    '\u22A1': MO.BIN4,       // squared dot operator
    '\u22A2': MO.REL,        // right tack
    '\u22A3': MO.REL,        // left tack
    '\u22A4': MO.ORD55,      // down tack
    '\u22A5': MO.REL,        // up tack
    '\u22A6': MO.REL,        // assertion
    '\u22A7': MO.REL,        // models
    '\u22A8': MO.REL,        // true
    '\u22A9': MO.REL,        // forces
    '\u22AA': MO.REL,        // triple vertical bar right turnstile
    '\u22AB': MO.REL,        // double vertical bar double right turnstile
    '\u22AC': MO.REL,        // does not prove
    '\u22AD': MO.REL,        // not true
    '\u22AE': MO.REL,        // does not force
    '\u22AF': MO.REL,        // negated double vertical bar double right turnstile
    '\u22B0': MO.REL,        // precedes under relation
    '\u22B1': MO.REL,        // succeeds under relation
    '\u22B2': MO.REL,        // normal subgroup of
    '\u22B3': MO.REL,        // contains as normal subgroup
    '\u22B4': MO.REL,        // normal subgroup of or equal to
    '\u22B5': MO.REL,        // contains as normal subgroup or equal to
    '\u22B6': MO.REL,        // original of
    '\u22B7': MO.REL,        // image of
    '\u22B8': MO.REL,        // multimap
    '\u22B9': MO.REL,        // hermitian conjugate matrix
    '\u22BA': MO.BIN4,       // intercalate
    '\u22BB': MO.BIN4,       // xor
    '\u22BC': MO.BIN4,       // nand
    '\u22BD': MO.BIN4,       // nor
    '\u22BE': MO.BIN3,       // right angle with arc
    '\u22BF': MO.BIN3,       // right triangle
    '\u22C4': MO.BIN4,       // diamond operator
    '\u22C5': MO.BIN4,       // dot operator
    '\u22C6': MO.BIN4,       // star operator
    '\u22C7': MO.BIN4,       // division times
    '\u22C8': MO.REL,        // bowtie
    '\u22C9': MO.BIN4,       // left normal factor semidirect product
    '\u22CA': MO.BIN4,       // right normal factor semidirect product
    '\u22CB': MO.BIN4,       // left semidirect product
    '\u22CC': MO.BIN4,       // right semidirect product
    '\u22CD': MO.REL,        // reversed tilde equals
    '\u22CE': MO.BIN4,       // curly logical or
    '\u22CF': MO.BIN4,       // curly logical and
    '\u22D0': MO.REL,        // double subset
    '\u22D1': MO.REL,        // double superset
    '\u22D2': MO.BIN4,       // double intersection
    '\u22D3': MO.BIN4,       // double union
    '\u22D4': MO.REL,        // pitchfork
    '\u22D5': MO.REL,        // equal and parallel to
    '\u22D6': MO.REL,        // less-than with dot
    '\u22D7': MO.REL,        // greater-than with dot
    '\u22D8': MO.REL,        // very much less-than
    '\u22D9': MO.REL,        // very much greater-than
    '\u22DA': MO.REL,        // less-than equal to or greater-than
    '\u22DB': MO.REL,        // greater-than equal to or less-than
    '\u22DC': MO.REL,        // equal to or less-than
    '\u22DD': MO.REL,        // equal to or greater-than
    '\u22DE': MO.REL,        // equal to or precedes
    '\u22DF': MO.REL,        // equal to or succeeds
    '\u22E0': MO.REL,        // does not precede or equal
    '\u22E1': MO.REL,        // does not succeed or equal
    '\u22E2': MO.REL,        // not square image of or equal to
    '\u22E3': MO.REL,        // not square original of or equal to
    '\u22E4': MO.REL,        // square image of or not equal to
    '\u22E5': MO.REL,        // square original of or not equal to
    '\u22E6': MO.REL,        // less-than but not equivalent to
    '\u22E7': MO.REL,        // greater-than but not equivalent to
    '\u22E8': MO.REL,        // precedes but not equivalent to
    '\u22E9': MO.REL,        // succeeds but not equivalent to
    '\u22EA': MO.REL,        // not normal subgroup of
    '\u22EB': MO.REL,        // does not contain as normal subgroup
    '\u22EC': MO.REL,        // not normal subgroup of or equal to
    '\u22ED': MO.REL,        // does not contain as normal subgroup or equal
    '\u22EE': MO.ORD55,      // vertical ellipsis
    '\u22EF': MO.INNER,      // midline horizontal ellipsis
    '\u22F0': MO.REL,        // up right diagonal ellipsis
    '\u22F1': [5, 5, TEXCLASS.INNER, null], // down right diagonal ellipsis
    '\u22F2': MO.REL,        // element of with long horizontal stroke
    '\u22F3': MO.REL,        // element of with vertical bar at end of horizontal stroke
    '\u22F4': MO.REL,        // small element of with vertical bar at end of horizontal stroke
    '\u22F5': MO.REL,        // element of with dot above
    '\u22F6': MO.REL,        // element of with overbar
    '\u22F7': MO.REL,        // small element of with overbar
    '\u22F8': MO.REL,        // element of with underbar
    '\u22F9': MO.REL,        // element of with two horizontal strokes
    '\u22FA': MO.REL,        // contains with long horizontal stroke
    '\u22FB': MO.REL,        // contains with vertical bar at end of horizontal stroke
    '\u22FC': MO.REL,        // small contains with vertical bar at end of horizontal stroke
    '\u22FD': MO.REL,        // contains with overbar
    '\u22FE': MO.REL,        // small contains with overbar
    '\u22FF': MO.REL,        // z notation bag membership
    '\u2305': MO.BIN3,       // barwedge
    '\u2306': MO.BIN3,       // doublebarwedge
    '\u2322': MO.REL4,       // \frown
    '\u2323': MO.REL4,       // \smile
    '\u2329': MO.OPEN,       // langle
    '\u232A': MO.CLOSE,      // rangle
    '\u23AA': MO.ORD,        // \bracevert
    '\u23AF': [0, 0, TEXCLASS.ORD, {stretchy: true}], // \underline
    '\u23B0': MO.OPEN,       // \lmoustache
    '\u23B1': MO.CLOSE,      // \rmoustache
    '\u2500': MO.ORD,        // horizontal line
    '\u25B3': MO.BIN4,       // white up-pointing triangle
    '\u25B5': MO.BIN4,       // white up-pointing small triangle
    '\u25B9': MO.BIN4,       // white right-pointing small triangle
    '\u25BD': MO.BIN4,       // white down-pointing triangle
    '\u25BF': MO.BIN4,       // white down-pointing small triangle
    '\u25C3': MO.BIN4,       // white left-pointing small triangle
    '\u25EF': MO.BIN3,       // \bigcirc
    '\u2660': MO.ORD,        // \spadesuit
    '\u2661': MO.ORD,        // \heartsuit
    '\u2662': MO.ORD,        // \diamondsuit
    '\u2663': MO.ORD,        // \clubsuit
    '\u2758': MO.REL,        // light vertical bar
    '\u27F0': MO.RELSTRETCH, // upwards quadruple arrow
    '\u27F1': MO.RELSTRETCH, // downwards quadruple arrow
    '\u27F5': MO.WIDEREL,    // long leftwards arrow
    '\u27F6': MO.WIDEREL,    // long rightwards arrow
    '\u27F7': MO.WIDEREL,    // long left right arrow
    '\u27F8': MO.WIDEREL,    // long leftwards double arrow
    '\u27F9': MO.WIDEREL,    // long rightwards double arrow
    '\u27FA': MO.WIDEREL,    // long left right double arrow
    '\u27FB': MO.WIDEREL,    // long leftwards arrow from bar
    '\u27FC': MO.WIDEREL,    // long rightwards arrow from bar
    '\u27FD': MO.WIDEREL,    // long leftwards double arrow from bar
    '\u27FE': MO.WIDEREL,    // long rightwards double arrow from bar
    '\u27FF': MO.WIDEREL,    // long rightwards squiggle arrow
    '\u2900': MO.RELACCENT,  // rightwards two-headed arrow with vertical stroke
    '\u2901': MO.RELACCENT,  // rightwards two-headed arrow with double vertical stroke
    '\u2902': MO.RELACCENT,  // leftwards double arrow with vertical stroke
    '\u2903': MO.RELACCENT,  // rightwards double arrow with vertical stroke
    '\u2904': MO.RELACCENT,  // left right double arrow with vertical stroke
    '\u2905': MO.RELACCENT,  // rightwards two-headed arrow from bar
    '\u2906': MO.RELACCENT,  // leftwards double arrow from bar
    '\u2907': MO.RELACCENT,  // rightwards double arrow from bar
    '\u2908': MO.REL,        // downwards arrow with horizontal stroke
    '\u2909': MO.REL,        // upwards arrow with horizontal stroke
    '\u290A': MO.RELSTRETCH, // upwards triple arrow
    '\u290B': MO.RELSTRETCH, // downwards triple arrow
    '\u290C': MO.WIDEREL,    // leftwards double dash arrow
    '\u290D': MO.WIDEREL,    // rightwards double dash arrow
    '\u290E': MO.WIDEREL,    // leftwards triple dash arrow
    '\u290F': MO.WIDEREL,    // rightwards triple dash arrow
    '\u2910': MO.WIDEREL,    // rightwards two-headed triple dash arrow
    '\u2911': MO.RELACCENT,  // rightwards arrow with dotted stem
    '\u2912': MO.RELSTRETCH, // upwards arrow to bar
    '\u2913': MO.RELSTRETCH, // downwards arrow to bar
    '\u2914': MO.RELACCENT,  // rightwards arrow with tail with vertical stroke
    '\u2915': MO.RELACCENT,  // rightwards arrow with tail with double vertical stroke
    '\u2916': MO.RELACCENT,  // rightwards two-headed arrow with tail
    '\u2917': MO.RELACCENT,  // rightwards two-headed arrow with tail with vertical stroke
    '\u2918': MO.RELACCENT,  // rightwards two-headed arrow with tail with double vertical stroke
    '\u2919': MO.RELACCENT,  // leftwards arrow-tail
    '\u291A': MO.RELACCENT,  // rightwards arrow-tail
    '\u291B': MO.RELACCENT,  // leftwards double arrow-tail
    '\u291C': MO.RELACCENT,  // rightwards double arrow-tail
    '\u291D': MO.RELACCENT,  // leftwards arrow to black diamond
    '\u291E': MO.RELACCENT,  // rightwards arrow to black diamond
    '\u291F': MO.RELACCENT,  // leftwards arrow from bar to black diamond
    '\u2920': MO.RELACCENT,  // rightwards arrow from bar to black diamond
    '\u2921': MO.RELSTRETCH, // north west and south east arrow
    '\u2922': MO.RELSTRETCH, // north east and south west arrow
    '\u2923': MO.REL,        // north west arrow with hook
    '\u2924': MO.REL,        // north east arrow with hook
    '\u2925': MO.REL,        // south east arrow with hook
    '\u2926': MO.REL,        // south west arrow with hook
    '\u2927': MO.REL,        // north west arrow and north east arrow
    '\u2928': MO.REL,        // north east arrow and south east arrow
    '\u2929': MO.REL,        // south east arrow and south west arrow
    '\u292A': MO.REL,        // south west arrow and north west arrow
    '\u292B': MO.REL,        // rising diagonal crossing falling diagonal
    '\u292C': MO.REL,        // falling diagonal crossing rising diagonal
    '\u292D': MO.REL,        // south east arrow crossing north east arrow
    '\u292E': MO.REL,        // north east arrow crossing south east arrow
    '\u292F': MO.REL,        // falling diagonal crossing north east arrow
    '\u2930': MO.REL,        // rising diagonal crossing south east arrow
    '\u2931': MO.REL,        // north east arrow crossing north west arrow
    '\u2932': MO.REL,        // north west arrow crossing north east arrow
    '\u2933': MO.RELACCENT,  // wave arrow pointing directly right
    '\u2934': MO.REL,        // arrow pointing rightwards then curving upwards
    '\u2935': MO.REL,        // arrow pointing rightwards then curving downwards
    '\u2936': MO.REL,        // arrow pointing downwards then curving leftwards
    '\u2937': MO.REL,        // arrow pointing downwards then curving rightwards
    '\u2938': MO.REL,        // right-side arc clockwise arrow
    '\u2939': MO.REL,        // left-side arc anticlockwise arrow
    '\u293A': MO.RELACCENT,  // top arc anticlockwise arrow
    '\u293B': MO.RELACCENT,  // bottom arc anticlockwise arrow
    '\u293C': MO.RELACCENT,  // top arc clockwise arrow with minus
    '\u293D': MO.RELACCENT,  // top arc anticlockwise arrow with plus
    '\u293E': MO.REL,        // lower right semicircular clockwise arrow
    '\u293F': MO.REL,        // lower left semicircular anticlockwise arrow
    '\u2940': MO.REL,        // anticlockwise closed circle arrow
    '\u2941': MO.REL,        // clockwise closed circle arrow
    '\u2942': MO.RELACCENT,  // rightwards arrow above short leftwards arrow
    '\u2943': MO.RELACCENT,  // leftwards arrow above short rightwards arrow
    '\u2944': MO.RELACCENT,  // short rightwards arrow above leftwards arrow
    '\u2945': MO.RELACCENT,  // rightwards arrow with plus below
    '\u2946': MO.RELACCENT,  // leftwards arrow with plus below
    '\u2947': MO.RELACCENT,  // rightwards arrow through x
    '\u2948': MO.RELACCENT,  // left right arrow through small circle
    '\u2949': MO.REL,        // upwards two-headed arrow from small circle
    '\u294A': MO.RELACCENT,  // left barb up right barb down harpoon
    '\u294B': MO.RELACCENT,  // left barb down right barb up harpoon
    '\u294C': MO.REL,        // up barb right down barb left harpoon
    '\u294D': MO.REL,        // up barb left down barb right harpoon
    '\u294E': MO.WIDEREL,    // left barb up right barb up harpoon
    '\u294F': MO.RELSTRETCH, // up barb right down barb right harpoon
    '\u2950': MO.WIDEREL,    // left barb down right barb down harpoon
    '\u2951': MO.RELSTRETCH, // up barb left down barb left harpoon
    '\u2952': MO.WIDEREL,    // leftwards harpoon with barb up to bar
    '\u2953': MO.WIDEREL,    // rightwards harpoon with barb up to bar
    '\u2954': MO.RELSTRETCH, // upwards harpoon with barb right to bar
    '\u2955': MO.RELSTRETCH, // downwards harpoon with barb right to bar
    '\u2956': MO.RELSTRETCH, // leftwards harpoon with barb down to bar
    '\u2957': MO.RELSTRETCH, // rightwards harpoon with barb down to bar
    '\u2958': MO.RELSTRETCH, // upwards harpoon with barb left to bar
    '\u2959': MO.RELSTRETCH, // downwards harpoon with barb left to bar
    '\u295A': MO.WIDEREL,    // leftwards harpoon with barb up from bar
    '\u295B': MO.WIDEREL,    // rightwards harpoon with barb up from bar
    '\u295C': MO.RELSTRETCH, // upwards harpoon with barb right from bar
    '\u295D': MO.RELSTRETCH, // downwards harpoon with barb right from bar
    '\u295E': MO.WIDEREL,    // leftwards harpoon with barb down from bar
    '\u295F': MO.WIDEREL,    // rightwards harpoon with barb down from bar
    '\u2960': MO.RELSTRETCH, // upwards harpoon with barb left from bar
    '\u2961': MO.RELSTRETCH, // downwards harpoon with barb left from bar
    '\u2962': MO.RELACCENT,  // leftwards harpoon with barb up above leftwards harpoon with barb down
    '\u2963': MO.REL,        // upwards harpoon with barb left beside upwards harpoon with barb right
    '\u2964': MO.RELACCENT,  // rightwards harpoon with barb up above rightwards harpoon with barb down
    '\u2965': MO.REL,        // downwards harpoon with barb left beside downwards harpoon with barb right
    '\u2966': MO.RELACCENT,  // leftwards harpoon with barb up above rightwards harpoon with barb up
    '\u2967': MO.RELACCENT,  // leftwards harpoon with barb down above rightwards harpoon with barb down
    '\u2968': MO.RELACCENT,  // rightwards harpoon with barb up above leftwards harpoon with barb up
    '\u2969': MO.RELACCENT,  // rightwards harpoon with barb down above leftwards harpoon with barb down
    '\u296A': MO.RELACCENT,  // leftwards harpoon with barb up above long dash
    '\u296B': MO.RELACCENT,  // leftwards harpoon with barb down below long dash
    '\u296C': MO.RELACCENT,  // rightwards harpoon with barb up above long dash
    '\u296D': MO.RELACCENT,  // rightwards harpoon with barb down below long dash
    '\u296E': MO.RELSTRETCH, // upwards harpoon with barb left beside downwards harpoon with barb right
    '\u296F': MO.RELSTRETCH, // downwards harpoon with barb left beside upwards harpoon with barb right
    '\u2970': MO.RELACCENT,  // right double arrow with rounded head
    '\u2971': MO.RELACCENT,  // equals sign above rightwards arrow
    '\u2972': MO.RELACCENT,  // tilde operator above rightwards arrow
    '\u2973': MO.RELACCENT,  // leftwards arrow above tilde operator
    '\u2974': MO.RELACCENT,  // rightwards arrow above tilde operator
    '\u2975': MO.RELACCENT,  // rightwards arrow above almost equal to
    '\u2976': MO.RELACCENT,  // less-than above leftwards arrow
    '\u2977': MO.RELACCENT,  // leftwards arrow through less-than
    '\u2978': MO.RELACCENT,  // greater-than above rightwards arrow
    '\u2979': MO.RELACCENT,  // subset above rightwards arrow
    '\u297A': MO.RELACCENT,  // leftwards arrow through subset
    '\u297B': MO.RELACCENT,  // superset above leftwards arrow
    '\u297C': MO.RELACCENT,  // left fish tail
    '\u297D': MO.RELACCENT,  // right fish tail
    '\u297E': MO.REL,        // up fish tail
    '\u297F': MO.REL,        // down fish tail
    '\u2981': MO.BIN3,       // z notation spot
    '\u2982': MO.BIN3,       // z notation type colon
    '\u2999': MO.BIN3,       // dotted fence
    '\u299A': MO.BIN3,       // vertical zigzag line
    '\u299B': MO.BIN3,       // measured angle opening left
    '\u299C': MO.BIN3,       // right angle variant with square
    '\u299D': MO.BIN3,       // measured right angle with dot
    '\u299E': MO.BIN3,       // angle with s inside
    '\u299F': MO.BIN3,       // acute angle
    '\u29A0': MO.BIN3,       // spherical angle opening left
    '\u29A1': MO.BIN3,       // spherical angle opening up
    '\u29A2': MO.BIN3,       // turned angle
    '\u29A3': MO.BIN3,       // reversed angle
    '\u29A4': MO.BIN3,       // angle with underbar
    '\u29A5': MO.BIN3,       // reversed angle with underbar
    '\u29A6': MO.BIN3,       // oblique angle opening up
    '\u29A7': MO.BIN3,       // oblique angle opening down
    '\u29A8': MO.BIN3,       // measured angle with open arm ending in arrow pointing up and right
    '\u29A9': MO.BIN3,       // measured angle with open arm ending in arrow pointing up and left
    '\u29AA': MO.BIN3,       // measured angle with open arm ending in arrow pointing down and right
    '\u29AB': MO.BIN3,       // measured angle with open arm ending in arrow pointing down and left
    '\u29AC': MO.BIN3,       // measured angle with open arm ending in arrow pointing right and up
    '\u29AD': MO.BIN3,       // measured angle with open arm ending in arrow pointing left and up
    '\u29AE': MO.BIN3,       // measured angle with open arm ending in arrow pointing right and down
    '\u29AF': MO.BIN3,       // measured angle with open arm ending in arrow pointing left and down
    '\u29B0': MO.BIN3,       // reversed empty set
    '\u29B1': MO.BIN3,       // empty set with overbar
    '\u29B2': MO.BIN3,       // empty set with small circle above
    '\u29B3': MO.BIN3,       // empty set with right arrow above
    '\u29B4': MO.BIN3,       // empty set with left arrow above
    '\u29B5': MO.BIN3,       // circle with horizontal bar
    '\u29B6': MO.BIN4,       // circled vertical bar
    '\u29B7': MO.BIN4,       // circled parallel
    '\u29B8': MO.BIN4,       // circled reverse solidus
    '\u29B9': MO.BIN4,       // circled perpendicular
    '\u29BA': MO.BIN4,       // circle divided by horizontal bar and top half divided by vertical bar
    '\u29BB': MO.BIN4,       // circle with superimposed x
    '\u29BC': MO.BIN4,       // circled anticlockwise-rotated division sign
    '\u29BD': MO.BIN4,       // up arrow through circle
    '\u29BE': MO.BIN4,       // circled white bullet
    '\u29BF': MO.BIN4,       // circled bullet
    '\u29C0': MO.REL,        // circled less-than
    '\u29C1': MO.REL,        // circled greater-than
    '\u29C2': MO.BIN3,       // circle with small circle to the right
    '\u29C3': MO.BIN3,       // circle with two horizontal strokes to the right
    '\u29C4': MO.BIN4,       // squared rising diagonal slash
    '\u29C5': MO.BIN4,       // squared falling diagonal slash
    '\u29C6': MO.BIN4,       // squared asterisk
    '\u29C7': MO.BIN4,       // squared small circle
    '\u29C8': MO.BIN4,       // squared square
    '\u29C9': MO.BIN3,       // two joined squares
    '\u29CA': MO.BIN3,       // triangle with dot above
    '\u29CB': MO.BIN3,       // triangle with underbar
    '\u29CC': MO.BIN3,       // s in triangle
    '\u29CD': MO.BIN3,       // triangle with serifs at bottom
    '\u29CE': MO.REL,        // right triangle above left triangle
    '\u29CF': MO.REL,        // left triangle beside vertical bar
    '\u29CF\u0338': MO.REL,  // left triangle beside vertical bar with slash
    '\u29D0': MO.REL,        // vertical bar beside right triangle
    '\u29D0\u0338': MO.REL,  // vertical bar beside right triangle with slash
    '\u29D1': MO.REL,        // bowtie with left half black
    '\u29D2': MO.REL,        // bowtie with right half black
    '\u29D3': MO.REL,        // black bowtie
    '\u29D4': MO.REL,        // times with left half black
    '\u29D5': MO.REL,        // times with right half black
    '\u29D6': MO.BIN4,       // white hourglass
    '\u29D7': MO.BIN4,       // black hourglass
    '\u29D8': MO.BIN3,       // left wiggly fence
    '\u29D9': MO.BIN3,       // right wiggly fence
    '\u29DB': MO.BIN3,       // right double wiggly fence
    '\u29DC': MO.BIN3,       // incomplete infinity
    '\u29DD': MO.BIN3,       // tie over infinity
    '\u29DE': MO.REL,        // infinity negated with vertical bar
    '\u29DF': MO.BIN3,       // double-ended multimap
    '\u29E0': MO.BIN3,       // square with contoured outline
    '\u29E1': MO.REL,        // increases as
    '\u29E2': MO.BIN4,       // shuffle product
    '\u29E3': MO.REL,        // equals sign and slanted parallel
    '\u29E4': MO.REL,        // equals sign and slanted parallel with tilde above
    '\u29E5': MO.REL,        // identical to and slanted parallel
    '\u29E6': MO.REL,        // gleich stark
    '\u29E7': MO.BIN3,       // thermodynamic
    '\u29E8': MO.BIN3,       // down-pointing triangle with left half black
    '\u29E9': MO.BIN3,       // down-pointing triangle with right half black
    '\u29EA': MO.BIN3,       // black diamond with down arrow
    '\u29EB': MO.BIN3,       // black lozenge
    '\u29EC': MO.BIN3,       // white circle with down arrow
    '\u29ED': MO.BIN3,       // black circle with down arrow
    '\u29EE': MO.BIN3,       // error-barred white square
    '\u29EF': MO.BIN3,       // error-barred black square
    '\u29F0': MO.BIN3,       // error-barred white diamond
    '\u29F1': MO.BIN3,       // error-barred black diamond
    '\u29F2': MO.BIN3,       // error-barred white circle
    '\u29F3': MO.BIN3,       // error-barred black circle
    '\u29F4': MO.REL,        // rule-delayed
    '\u29F5': MO.BIN4,       // reverse solidus operator
    '\u29F6': MO.BIN4,       // solidus with overbar
    '\u29F7': MO.BIN4,       // reverse solidus with horizontal stroke
    '\u29F8': MO.BIN3,       // big solidus
    '\u29F9': MO.BIN3,       // big reverse solidus
    '\u29FA': MO.BIN3,       // double plus
    '\u29FB': MO.BIN3,       // triple plus
    '\u29FE': MO.BIN4,       // tiny
    '\u29FF': MO.BIN4,       // miny
    '\u2A1D': MO.BIN3,       // join
    '\u2A1E': MO.BIN3,       // large left triangle operator
    '\u2A1F': MO.BIN3,       // z notation schema composition
    '\u2A20': MO.BIN3,       // z notation schema piping
    '\u2A21': MO.BIN3,       // z notation schema projection
    '\u2A22': MO.BIN4,       // plus sign with small circle above
    '\u2A23': MO.BIN4,       // plus sign with circumflex accent above
    '\u2A24': MO.BIN4,       // plus sign with tilde above
    '\u2A25': MO.BIN4,       // plus sign with dot below
    '\u2A26': MO.BIN4,       // plus sign with tilde below
    '\u2A27': MO.BIN4,       // plus sign with subscript two
    '\u2A28': MO.BIN4,       // plus sign with black triangle
    '\u2A29': MO.BIN4,       // minus sign with comma above
    '\u2A2A': MO.BIN4,       // minus sign with dot below
    '\u2A2B': MO.BIN4,       // minus sign with falling dots
    '\u2A2C': MO.BIN4,       // minus sign with rising dots
    '\u2A2D': MO.BIN4,       // plus sign in left half circle
    '\u2A2E': MO.BIN4,       // plus sign in right half circle
    '\u2A2F': MO.BIN4,       // vector or cross product
    '\u2A30': MO.BIN4,       // multiplication sign with dot above
    '\u2A31': MO.BIN4,       // multiplication sign with underbar
    '\u2A32': MO.BIN4,       // semidirect product with bottom closed
    '\u2A33': MO.BIN4,       // smash product
    '\u2A34': MO.BIN4,       // multiplication sign in left half circle
    '\u2A35': MO.BIN4,       // multiplication sign in right half circle
    '\u2A36': MO.BIN4,       // circled multiplication sign with circumflex accent
    '\u2A37': MO.BIN4,       // multiplication sign in double circle
    '\u2A38': MO.BIN4,       // circled division sign
    '\u2A39': MO.BIN4,       // plus sign in triangle
    '\u2A3A': MO.BIN4,       // minus sign in triangle
    '\u2A3B': MO.BIN4,       // multiplication sign in triangle
    '\u2A3C': MO.BIN4,       // interior product
    '\u2A3D': MO.BIN4,       // righthand interior product
    '\u2A3E': MO.BIN4,       // z notation relational composition
    '\u2A3F': MO.BIN4,       // amalgamation or coproduct
    '\u2A40': MO.BIN4,       // intersection with dot
    '\u2A41': MO.BIN4,       // union with minus sign
    '\u2A42': MO.BIN4,       // union with overbar
    '\u2A43': MO.BIN4,       // intersection with overbar
    '\u2A44': MO.BIN4,       // intersection with logical and
    '\u2A45': MO.BIN4,       // union with logical or
    '\u2A46': MO.BIN4,       // union above intersection
    '\u2A47': MO.BIN4,       // intersection above union
    '\u2A48': MO.BIN4,       // union above bar above intersection
    '\u2A49': MO.BIN4,       // intersection above bar above union
    '\u2A4A': MO.BIN4,       // union beside and joined with union
    '\u2A4B': MO.BIN4,       // intersection beside and joined with intersection
    '\u2A4C': MO.BIN4,       // closed union with serifs
    '\u2A4D': MO.BIN4,       // closed intersection with serifs
    '\u2A4E': MO.BIN4,       // double square intersection
    '\u2A4F': MO.BIN4,       // double square union
    '\u2A50': MO.BIN4,       // closed union with serifs and smash product
    '\u2A51': MO.BIN4,       // logical and with dot above
    '\u2A52': MO.BIN4,       // logical or with dot above
    '\u2A53': MO.BIN4,       // double logical and
    '\u2A54': MO.BIN4,       // double logical or
    '\u2A55': MO.BIN4,       // two intersecting logical and
    '\u2A56': MO.BIN4,       // two intersecting logical or
    '\u2A57': MO.BIN4,       // sloping large or
    '\u2A58': MO.BIN4,       // sloping large and
    '\u2A59': MO.REL,        // logical or overlapping logical and
    '\u2A5A': MO.BIN4,       // logical and with middle stem
    '\u2A5B': MO.BIN4,       // logical or with middle stem
    '\u2A5C': MO.BIN4,       // logical and with horizontal dash
    '\u2A5D': MO.BIN4,       // logical or with horizontal dash
    '\u2A5E': MO.BIN4,       // logical and with double overbar
    '\u2A5F': MO.BIN4,       // logical and with underbar
    '\u2A60': MO.BIN4,       // logical and with double underbar
    '\u2A61': MO.BIN4,       // small vee with underbar
    '\u2A62': MO.BIN4,       // logical or with double overbar
    '\u2A63': MO.BIN4,       // logical or with double underbar
    '\u2A64': MO.BIN4,       // z notation domain antirestriction
    '\u2A65': MO.BIN4,       // z notation range antirestriction
    '\u2A66': MO.REL,        // equals sign with dot below
    '\u2A67': MO.REL,        // identical with dot above
    '\u2A68': MO.REL,        // triple horizontal bar with double vertical stroke
    '\u2A69': MO.REL,        // triple horizontal bar with triple vertical stroke
    '\u2A6A': MO.REL,        // tilde operator with dot above
    '\u2A6B': MO.REL,        // tilde operator with rising dots
    '\u2A6C': MO.REL,        // similar minus similar
    '\u2A6D': MO.REL,        // congruent with dot above
    '\u2A6E': MO.REL,        // equals with asterisk
    '\u2A6F': MO.REL,        // almost equal to with circumflex accent
    '\u2A70': MO.REL,        // approximately equal or equal to
    '\u2A71': MO.BIN4,       // equals sign above plus sign
    '\u2A72': MO.BIN4,       // plus sign above equals sign
    '\u2A73': MO.REL,        // equals sign above tilde operator
    '\u2A74': MO.REL,        // double colon equal
    '\u2A75': MO.REL,        // two consecutive equals signs
    '\u2A76': MO.REL,        // three consecutive equals signs
    '\u2A77': MO.REL,        // equals sign with two dots above and two dots below
    '\u2A78': MO.REL,        // equivalent with four dots above
    '\u2A79': MO.REL,        // less-than with circle inside
    '\u2A7A': MO.REL,        // greater-than with circle inside
    '\u2A7B': MO.REL,        // less-than with question mark above
    '\u2A7C': MO.REL,        // greater-than with question mark above
    '\u2A7D': MO.REL,        // less-than or slanted equal to
    '\u2A7D\u0338': MO.REL,  // less-than or slanted equal to with slash
    '\u2A7E': MO.REL,        // greater-than or slanted equal to
    '\u2A7E\u0338': MO.REL,  // greater-than or slanted equal to with slash
    '\u2A7F': MO.REL,        // less-than or slanted equal to with dot inside
    '\u2A80': MO.REL,        // greater-than or slanted equal to with dot inside
    '\u2A81': MO.REL,        // less-than or slanted equal to with dot above
    '\u2A82': MO.REL,        // greater-than or slanted equal to with dot above
    '\u2A83': MO.REL,        // less-than or slanted equal to with dot above right
    '\u2A84': MO.REL,        // greater-than or slanted equal to with dot above left
    '\u2A85': MO.REL,        // less-than or approximate
    '\u2A86': MO.REL,        // greater-than or approximate
    '\u2A87': MO.REL,        // less-than and single-line not equal to
    '\u2A88': MO.REL,        // greater-than and single-line not equal to
    '\u2A89': MO.REL,        // less-than and not approximate
    '\u2A8A': MO.REL,        // greater-than and not approximate
    '\u2A8B': MO.REL,        // less-than above double-line equal above greater-than
    '\u2A8C': MO.REL,        // greater-than above double-line equal above less-than
    '\u2A8D': MO.REL,        // less-than above similar or equal
    '\u2A8E': MO.REL,        // greater-than above similar or equal
    '\u2A8F': MO.REL,        // less-than above similar above greater-than
    '\u2A90': MO.REL,        // greater-than above similar above less-than
    '\u2A91': MO.REL,        // less-than above greater-than above double-line equal
    '\u2A92': MO.REL,        // greater-than above less-than above double-line equal
    '\u2A93': MO.REL,        // less-than above slanted equal above greater-than above slanted equal
    '\u2A94': MO.REL,        // greater-than above slanted equal above less-than above slanted equal
    '\u2A95': MO.REL,        // slanted equal to or less-than
    '\u2A96': MO.REL,        // slanted equal to or greater-than
    '\u2A97': MO.REL,        // slanted equal to or less-than with dot inside
    '\u2A98': MO.REL,        // slanted equal to or greater-than with dot inside
    '\u2A99': MO.REL,        // double-line equal to or less-than
    '\u2A9A': MO.REL,        // double-line equal to or greater-than
    '\u2A9B': MO.REL,        // double-line slanted equal to or less-than
    '\u2A9C': MO.REL,        // double-line slanted equal to or greater-than
    '\u2A9D': MO.REL,        // similar or less-than
    '\u2A9E': MO.REL,        // similar or greater-than
    '\u2A9F': MO.REL,        // similar above less-than above equals sign
    '\u2AA0': MO.REL,        // similar above greater-than above equals sign
    '\u2AA1': MO.REL,        // double nested less-than
    '\u2AA1\u0338': MO.REL,  // double nested less-than with slash
    '\u2AA2': MO.REL,        // double nested greater-than
    '\u2AA2\u0338': MO.REL,  // double nested greater-than with slash
    '\u2AA3': MO.REL,        // double nested less-than with underbar
    '\u2AA4': MO.REL,        // greater-than overlapping less-than
    '\u2AA5': MO.REL,        // greater-than beside less-than
    '\u2AA6': MO.REL,        // less-than closed by curve
    '\u2AA7': MO.REL,        // greater-than closed by curve
    '\u2AA8': MO.REL,        // less-than closed by curve above slanted equal
    '\u2AA9': MO.REL,        // greater-than closed by curve above slanted equal
    '\u2AAA': MO.REL,        // smaller than
    '\u2AAB': MO.REL,        // larger than
    '\u2AAC': MO.REL,        // smaller than or equal to
    '\u2AAD': MO.REL,        // larger than or equal to
    '\u2AAE': MO.REL,        // equals sign with bumpy above
    '\u2AAF': MO.REL,        // precedes above single-line equals sign
    '\u2AAF\u0338': MO.REL,  // precedes above single-line equals sign with slash
    '\u2AB0': MO.REL,        // succeeds above single-line equals sign
    '\u2AB0\u0338': MO.REL,  // succeeds above single-line equals sign with slash
    '\u2AB1': MO.REL,        // precedes above single-line not equal to
    '\u2AB2': MO.REL,        // succeeds above single-line not equal to
    '\u2AB3': MO.REL,        // precedes above equals sign
    '\u2AB4': MO.REL,        // succeeds above equals sign
    '\u2AB5': MO.REL,        // precedes above not equal to
    '\u2AB6': MO.REL,        // succeeds above not equal to
    '\u2AB7': MO.REL,        // precedes above almost equal to
    '\u2AB8': MO.REL,        // succeeds above almost equal to
    '\u2AB9': MO.REL,        // precedes above not almost equal to
    '\u2ABA': MO.REL,        // succeeds above not almost equal to
    '\u2ABB': MO.REL,        // double precedes
    '\u2ABC': MO.REL,        // double succeeds
    '\u2ABD': MO.REL,        // subset with dot
    '\u2ABE': MO.REL,        // superset with dot
    '\u2ABF': MO.REL,        // subset with plus sign below
    '\u2AC0': MO.REL,        // superset with plus sign below
    '\u2AC1': MO.REL,        // subset with multiplication sign below
    '\u2AC2': MO.REL,        // superset with multiplication sign below
    '\u2AC3': MO.REL,        // subset of or equal to with dot above
    '\u2AC4': MO.REL,        // superset of or equal to with dot above
    '\u2AC5': MO.REL,        // subset of above equals sign
    '\u2AC6': MO.REL,        // superset of above equals sign
    '\u2AC7': MO.REL,        // subset of above tilde operator
    '\u2AC8': MO.REL,        // superset of above tilde operator
    '\u2AC9': MO.REL,        // subset of above almost equal to
    '\u2ACA': MO.REL,        // superset of above almost equal to
    '\u2ACB': MO.REL,        // subset of above not equal to
    '\u2ACC': MO.REL,        // superset of above not equal to
    '\u2ACD': MO.REL,        // square left open box operator
    '\u2ACE': MO.REL,        // square right open box operator
    '\u2ACF': MO.REL,        // closed subset
    '\u2AD0': MO.REL,        // closed superset
    '\u2AD1': MO.REL,        // closed subset or equal to
    '\u2AD2': MO.REL,        // closed superset or equal to
    '\u2AD3': MO.REL,        // subset above superset
    '\u2AD4': MO.REL,        // superset above subset
    '\u2AD5': MO.REL,        // subset above subset
    '\u2AD6': MO.REL,        // superset above superset
    '\u2AD7': MO.REL,        // superset beside subset
    '\u2AD8': MO.REL,        // superset beside and joined by dash with subset
    '\u2AD9': MO.REL,        // element of opening downwards
    '\u2ADA': MO.REL,        // pitchfork with tee top
    '\u2ADB': MO.REL,        // transversal intersection
    '\u2ADC': MO.REL,        // forking
    '\u2ADD': MO.REL,        // nonforking
    '\u2ADE': MO.REL,        // short left tack
    '\u2ADF': MO.REL,        // short down tack
    '\u2AE0': MO.REL,        // short up tack
    '\u2AE1': MO.REL,        // perpendicular with s
    '\u2AE2': MO.REL,        // vertical bar triple right turnstile
    '\u2AE3': MO.REL,        // double vertical bar left turnstile
    '\u2AE4': MO.REL,        // vertical bar double left turnstile
    '\u2AE5': MO.REL,        // double vertical bar double left turnstile
    '\u2AE6': MO.REL,        // long dash from left member of double vertical
    '\u2AE7': MO.REL,        // short down tack with overbar
    '\u2AE8': MO.REL,        // short up tack with underbar
    '\u2AE9': MO.REL,        // short up tack above short down tack
    '\u2AEA': MO.REL,        // double down tack
    '\u2AEB': MO.REL,        // double up tack
    '\u2AEC': MO.REL,        // double stroke not sign
    '\u2AED': MO.REL,        // reversed double stroke not sign
    '\u2AEE': MO.REL,        // does not divide with reversed negation slash
    '\u2AEF': MO.REL,        // vertical line with circle above
    '\u2AF0': MO.REL,        // vertical line with circle below
    '\u2AF1': MO.REL,        // down tack with circle below
    '\u2AF2': MO.REL,        // parallel with horizontal stroke
    '\u2AF3': MO.REL,        // parallel with tilde operator
    '\u2AF4': MO.BIN4,       // triple vertical bar binary relation
    '\u2AF5': MO.BIN4,       // triple vertical bar with horizontal stroke
    '\u2AF6': MO.BIN4,       // triple colon operator
    '\u2AF7': MO.REL,        // triple nested less-than
    '\u2AF8': MO.REL,        // triple nested greater-than
    '\u2AF9': MO.REL,        // double-line slanted less-than or equal to
    '\u2AFA': MO.REL,        // double-line slanted greater-than or equal to
    '\u2AFB': MO.BIN4,       // triple solidus binary relation
    '\u2AFD': MO.BIN4,       // double solidus operator
    '\u2AFE': MO.BIN3,       // white vertical bar
    '\u2B45': MO.RELSTRETCH, // leftwards quadruple arrow
    '\u2B46': MO.RELSTRETCH, // rightwards quadruple arrow
    '\u3008': MO.OPEN,       // langle
    '\u3009': MO.CLOSE,      // rangle
    '\uFE37': MO.WIDEACCENT, // horizontal brace down
    '\uFE38': MO.WIDEACCENT, // horizontal brace up
  }
};

//
//  These are not in the W3C table, but FF works this way,
//  and it makes sense, so add them here
//
OPTABLE['infix']['^'] = MO.WIDEREL;
OPTABLE['infix']['_'] = MO.WIDEREL;
OPTABLE['prefix']['\u2223'] = MO.OPEN;
OPTABLE['prefix']['\u2225'] = MO.OPEN;
OPTABLE['postfix']['\u2223'] = MO.CLOSE;
OPTABLE['postfix']['\u2225'] = MO.CLOSE;

/*****************************************************************/
/**
 *  Implements the MmlMo node class (subclass of AbstractMmlTokenNode)
 */

class MmlMo extends AbstractMmlTokenNode {constructor(...args) { super(...args); MmlMo.prototype.__init.call(this);MmlMo.prototype.__init2.call(this);MmlMo.prototype.__init3.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlTokenNode.defaults,
    form: 'infix',
    fence: false,
    separator: false,
    lspace: 'thickmathspace',
    rspace: 'thickmathspace',
    stretchy: false,
    symmetric: false,
    maxsize: 'infinity',
    minsize: '0em', // MathML says '1em', but that is larger than some natural sizes
    largeop: false,
    movablelimits: false,
    accent: false,
    linebreak: 'auto',
    lineleading: '1ex',
    linebreakstyle: 'before',
    indentalign: 'auto',
    indentshift: '0',
    indenttarget: '',
    indentalignfirst: 'indentalign',
    indentshiftfirst: 'indentshift',
    indentalignlast: 'indentalign',
    indentshiftlast: 'indentshift'
  };}

  /**
   * Unicode ranges and their default TeX classes
   */
   static __initStatic2() {this.RANGES = RANGES;}

  /**
   * The MathML spacing values for the TeX classes
   */
   static __initStatic3() {this.MMLSPACING = MMLSPACING;}

  /**
   * The Operator Dictionary
   */
   static __initStatic4() {this.OPTABLE = OPTABLE;}

  /**
   * The internal TeX class of the node (for use with getter/setter below)
   */
   __init() {this._texClass = null;}

  /**
   * Use a getter to look up the TeX class from the operator table if it hasn't
   * been set yet (but don't save it in case the form changes when it is in its
   * location).
   */
   get texClass() {
    if (this._texClass === null) {
      let mo = this.getText();
      let [form1, form2, form3] = this.handleExplicitForm(this.getForms());
      let OPTABLE = (this.constructor ).OPTABLE;
      let def = OPTABLE[form1][mo] || OPTABLE[form2][mo] || OPTABLE[form3][mo];
      return def ? def[2] : TEXCLASS.REL;
    }
    return this._texClass;
  }

  /**
   * Use a setter to store the actual value in _texClass;
   */
   set texClass(value) {
    this._texClass = value;
  }

  /**
   * The default MathML spacing on the left
   */
  /* tslint:disable-next-line:whitespace */
   __init2() {this.lspace = 5/18;}

  /**
   * The default MathML spacing on the right
   */
  /* tslint:disable-next-line:whitespace */
   __init3() {this.rspace = 5/18;}

  /**
   * @override
   */
   get kind() {
    return 'mo';
  }

  /**
   * All <mo> are considered embellished
   * @override
   */
   get isEmbellished() {
    return true;
  }

  /**
   * @return {boolean}  Is <mo> marked as an explicit linebreak?
   */
   get hasNewLine() {
    return this.attributes.get('linebreak') === 'newline';
  }

  /**
   * @return {MmlNode}  The node that is the outermost embellished operator
   *                    with this node as its core
   */
   coreParent() {
    let embellished = this ;
    let parent = this ;
    let math = this.factory.getNodeClass('math');
    while (parent && parent.isEmbellished && parent.coreMO() === this && !(parent instanceof math)) {
      embellished = parent;
      parent = (parent ).Parent;
    }
    return embellished;
  }

  /**
   * @param {MmlNode} parent  The node whose core text is to be obtained
   * @return {string}         The text of the core MO of the given parent element
   */
   coreText(parent) {
    if (!parent) {
      return '';
    }
    if (parent.isEmbellished) {
      return (parent.coreMO() ).getText();
    }
    while ((((parent.isKind('mrow') || parent.isKind('TeXAtom') || parent.isKind('mstyle') ||
              parent.isKind('mphantom')) && parent.childNodes.length === 1) ||
            parent.isKind('munderover')) && parent.childNodes[0]) {
      parent = parent.childNodes[0] ;
    }
    return (parent.isToken ? (parent ).getText() : '');
  }

  /**
   * @override
   */
   hasSpacingAttributes() {
    return this.attributes.isSet('lspace') ||
      this.attributes.isSet('rspace');
  }

  /**
   * @return {boolean}  True is this mo is an accent in an munderover construction
   */
  get isAccent() {
    let accent = false;
    const node = this.coreParent().parent;
    if (node) {
      const key = (node.isKind('mover') ?
                   ((node.childNodes[(node ).over] ).coreMO() ?
                    'accent' : '') :
                   node.isKind('munder') ?
                   ((node.childNodes[(node ).under] ).coreMO() ?
                    'accentunder' : '') :
                   node.isKind('munderover') ?
                   (this === (node.childNodes[(node ).over] ).coreMO() ?
                    'accent' :
                    this === (node.childNodes[(node ).under] ).coreMO() ?
                    'accentunder' : '') :
                   '');
      if (key) {
        const value = node.attributes.getExplicit(key);
        accent = (value !== undefined ? accent : this.attributes.get('accent')) ;
      }
    }
    return accent;
  }

  /**
   * Produce the texClass based on the operator dictionary values
   *
   * @override
   */
   setTeXclass(prev) {
    let {form, fence} = this.attributes.getList('form', 'fence') ;
    if (this.getProperty('texClass') === undefined &&
        (this.attributes.isSet('lspace') || this.attributes.isSet('rspace'))) {
      return null;
    }
    if (fence && this.texClass === TEXCLASS.REL) {
      if (form === 'prefix') {
        this.texClass = TEXCLASS.OPEN;
      }
      if (form === 'postfix') {
        this.texClass = TEXCLASS.CLOSE;
      }
    }
    if (this.getText() === '\u2061') {
      //
      //  Force previous node to be TEXCLASS.OP and skip this node
      //
      if (prev) {
        prev.texClass = TEXCLASS.OP;
        prev.setProperty('fnOP', true);
      }
      this.texClass = this.prevClass = TEXCLASS.NONE;
      return prev;
    }
    return this.adjustTeXclass(prev);
  }
  /**
   * Follow the TeXBook rules for adjusting the TeX class once its neighbors are known
   *
   * @param {MmlNode} prev  The node appearing before this one in the output
   * @return {MmlNode}      The last node displayed (this node)
   */
   adjustTeXclass(prev) {
    let texClass = this.texClass;
    let prevClass = this.prevClass;
    if (texClass === TEXCLASS.NONE) {
      return prev;
    }
    if (prev) {
      if (prev.getProperty('autoOP') && (texClass === TEXCLASS.BIN || texClass === TEXCLASS.REL)) {
        prevClass = prev.texClass = TEXCLASS.ORD;
      }
      prevClass = this.prevClass = (prev.texClass || TEXCLASS.ORD);
      this.prevLevel = this.attributes.getInherited('scriptlevel') ;
    } else {
      prevClass = this.prevClass = TEXCLASS.NONE;
    }
    if (texClass === TEXCLASS.BIN &&
        (prevClass === TEXCLASS.NONE || prevClass === TEXCLASS.BIN || prevClass === TEXCLASS.OP ||
         prevClass === TEXCLASS.REL || prevClass === TEXCLASS.OPEN || prevClass === TEXCLASS.PUNCT)) {
      this.texClass = TEXCLASS.ORD;
    } else if (prevClass === TEXCLASS.BIN &&
               (texClass === TEXCLASS.REL || texClass === TEXCLASS.CLOSE || texClass === TEXCLASS.PUNCT)) {
      prev.texClass = this.prevClass = TEXCLASS.ORD;
    } else if (texClass === TEXCLASS.BIN) {
      //
      // Check if node is the last one in its container since the rule
      // above only takes effect if there is a node that follows.
      //
      let child = this;
      let parent = this.parent;
      while (parent && parent.parent && parent.isEmbellished &&
             (parent.childNodes.length === 1 ||
              (!parent.isKind('mrow') && parent.core() === child))) {
        child = parent;
        parent = parent.parent;
      }
      if (parent.childNodes[parent.childNodes.length - 1] === child) {
        this.texClass = TEXCLASS.ORD;
      }
    }
    return this;
  }

  /**
   * Do the normal inheritance, then look up the attributes from the operator dictionary.
   * If there is no dictionary entry, get the TeX class from the Unicode range list.
   *
   * @override
   */
   setInheritedAttributes(attributes = {},
                                display = false, level = 0, prime = false) {
    super.setInheritedAttributes(attributes, display, level, prime);
    let mo = this.getText();
    let [form1, form2, form3] = this.handleExplicitForm(this.getForms());
    this.attributes.setInherited('form', form1);
    let OPTABLE = (this.constructor ).OPTABLE;
    let def = OPTABLE[form1][mo] || OPTABLE[form2][mo] || OPTABLE[form3][mo];
    if (def) {
      if (this.getProperty('texClass') === undefined) {
        this.texClass = def[2];
      }
      for (const name of Object.keys(def[3] || {})) {
        this.attributes.setInherited(name, def[3][name]);
      }
      this.lspace = (def[0] + 1) / 18;
      this.rspace = (def[1] + 1) / 18;
    } else {
      let range = this.getRange(mo);
      if (range) {
        if (this.getProperty('texClass') === undefined) {
          this.texClass = range[2];
        }
        const spacing = (this.constructor ).MMLSPACING[range[2]];
        this.lspace = (spacing[0] + 1) / 18;
        this.rspace = (spacing[1] + 1) / 18;
      }
    }
  }

  /**
   * @return {[string, string, string]}  The list of form attribute values in the
   *                                     order they should be tested, based on the
   *                                     position of the element in its parent.
   */
   getForms() {
    let core = this;
    let parent = this.parent;
    let Parent = this.Parent;
    while (Parent && Parent.isEmbellished) {
      core = parent;
      parent = Parent.parent;
      Parent = Parent.Parent;
    }
    if (parent && parent.isKind('mrow') && (parent ).nonSpaceLength() !== 1) {
      if ((parent ).firstNonSpace() === core) {
        return ['prefix', 'infix', 'postfix'];
      }
      if ((parent ).lastNonSpace() === core) {
        return ['postfix', 'infix', 'prefix'];
      }
    }
    return ['infix', 'prefix', 'postfix'];
  }

  /**
   * @param {string[]} forms     The three forms in the default order they are to be tested
   * @return {string[]}          The forms in the new order, if there is an explicit form attribute
   */
   handleExplicitForm(forms) {
    if (this.attributes.isSet('form')) {
      const form = this.attributes.get('form') ;
      forms = [form].concat(forms.filter(name => (name !== form)));
    }
    return forms;
  }

  /**
   * @param {string} mo  The character to look up in the range table
   * @return {RangeDef}  The unicode range in which the character falls, or null
   */
   getRange(mo) {
    if (!mo.match(/^[\uD800-\uDBFF]?.$/)) {
      return null;
    }
    let n = mo.codePointAt(0);
    let ranges = (this.constructor ).RANGES;
    for (const range of ranges) {
      if (range[0] <= n && n <= range[1]) {
        return range;
      }
      if (n < range[0]) {
        return null;
      }
    }
    return null;
  }

} MmlMo.__initStatic(); MmlMo.__initStatic2(); MmlMo.__initStatic3(); MmlMo.__initStatic4();

/*****************************************************************/
/**
 *  Implements the MmlMtext node class (subclass of AbstractMmlTokenNode)
 */

class MmlMtext extends AbstractMmlTokenNode {constructor(...args) { super(...args); MmlMtext.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlTokenNode.defaults
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'mtext';
  }

  /**
   * <mtext> is always space-like according to the spec
   * @override
   */
   get isSpacelike() {
    return true;
  }

} MmlMtext.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMspace node class (subclass of AbstractMmlTokenNode)
 */

class MmlMspace extends AbstractMmlTokenNode {constructor(...args) { super(...args); MmlMspace.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlTokenNode.defaults,
    width:  '0em',
    height: '0ex',
    depth:  '0ex',
    linebreak: 'auto'
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'mspace';
  }

  /**
   * mspace can't have children
   * @override
   */
   get arity() {
    return 0;
  }

  /**
   * @override
   */
   get isSpacelike() {
    return true;
  }

  /**
   * Only process linebreak if the space has no explicit dimensions (according to spec)
   *
   * @override
   */
   get hasNewline() {
    let attributes = this.attributes;
    return (attributes.getExplicit('width') == null && attributes.getExplicit('height') == null &&
            attributes.getExplicit('depth') == null && attributes.get('linebreak') === 'newline');
  }

} MmlMspace.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMs node class (subclass of AbstractMmlTokenNode)
 */

class MmlMs extends AbstractMmlTokenNode {constructor(...args) { super(...args); MmlMs.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlTokenNode.defaults,
    lquote: '"',
    rquote: '"'
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'ms';
  }

} MmlMs.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMrow node class (subclass of AbstractMmlNode)
 */

class MmlMrow extends AbstractMmlNode {constructor(...args) { super(...args); MmlMrow.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults
  };}

  /**
   * The index of the core child, when acting as an embellish mrow
   */
   __init() {this._core = null;}

  /**
   * @override
   */
   get kind() {
    return 'mrow';
  }

  /**
   * An mrow is space-like if all its children are.
   *
   * @override
   */
   get isSpacelike() {
    for (const child of this.childNodes) {
      if (!child.isSpacelike) {
        return false;
      }
    }
    return true;
  }

  /**
   * An mrow is embellished if it contains one embellished operator
   * and any number of space-like nodes
   *
   * @override
   */
   get isEmbellished() {
    let embellished = false;
    let i = 0;
    for (const child of this.childNodes) {
      if (child) {
        if (child.isEmbellished) {
          if (embellished) {
            return false;
          }
          embellished = true;
          this._core = i;
        } else if (!child.isSpacelike) {
          return false;
        }
      }
      i++;
    }
    return embellished;
  }

  /**
   * @override
   */
   core() {
    if (!this.isEmbellished || this._core == null) {
      return this;
    }
    return this.childNodes[this._core];
  }

  /**
   * @override
   */
   coreMO() {
    if (!this.isEmbellished || this._core == null) {
      return this;
    }
    return this.childNodes[this._core].coreMO();
  }

  /**
   * @return {number}  The number of non-spacelike child nodes
   */
   nonSpaceLength() {
    let n = 0;
    for (const child of this.childNodes) {
      if (child && !child.isSpacelike) {
        n++;
      }
    }
    return n;
  }

  /**
   * @return {MmlNode|null}  The first non-space-like child node
   */
   firstNonSpace() {
    for (const child of this.childNodes) {
      if (child && !child.isSpacelike) {
        return child;
      }
    }
    return null;
  }

  /**
   * @return {MmlNode|null}  The last non-space-like child node
   */
   lastNonSpace() {
    let i = this.childNodes.length;
    while (--i >= 0) {
      let child = this.childNodes[i];
      if (child && !child.isSpacelike) {
        return child;
      }
    }
    return null;
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    if ((this.getProperty('open') != null || this.getProperty('close') != null) &&
        (!prev || prev.getProperty('fnOP') != null)) {
      //
      // <mrow> came from \left...\right
      //   so treat as subexpression (TeX class INNER).
      // Use prev = null for the initial element in the
      //   delimiters, since there is nothing previous to
      //   it in what would be the TeX math list.
      //
      this.getPrevClass(prev);
      prev = null;
      for (const child of this.childNodes) {
        prev = child.setTeXclass(prev);
      }
      if (this.texClass == null) {
        this.texClass = TEXCLASS.INNER;
      }
    } else {
      //
      //  Normal <mrow>, so treat as though mrow is not there
      //
      for (const child of this.childNodes) {
        prev = child.setTeXclass(prev);
      }
      if (this.childNodes[0]) {
        this.updateTeXclass(this.childNodes[0]);
      }
    }
    return prev;
  }

} MmlMrow.__initStatic();


/*****************************************************************/
/**
 *  Implements the MmlInferredMrow node class (subclass of MmlMrow)
 */

class MmlInferredMrow extends MmlMrow {

  /**
   * @override
   */
   static __initStatic2() {this.defaults = MmlMrow.defaults;}

  /**
   * @return {string}  The inferred-mrow kind
   */
   get kind() {
    return 'inferredMrow';
  }

  /**
   * @return {boolean}  This is inferred
   */
   get isInferred() {
    return true;
  }

  /**
   * @override
   */
   get notParent() {
    return true;
  }

  /**
   * Show the child nodes in brackets
   */
   toString() {
    return '[' + this.childNodes.join(',') + ']';
  }

} MmlInferredMrow.__initStatic2();

/*****************************************************************/
/**
 *  Implements the MmlMfrac node class (subclass of AbstractMmlBaseNode)
 */

class MmlMfrac extends AbstractMmlBaseNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlBaseNode.defaults,
    linethickness: 'medium',
    numalign: 'center',
    denomalign: 'center',
    bevelled: false
  };}

  /**
   * @override
   */
   get kind() {
    return 'mfrac';
  }

  /**
   * <mfrac> requires two children
   * @override
   */
   get arity() {
    return 2;
  }

  /**
   * The children of <mfrac> can include line breaks
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * Update the children separately
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    for (const child of this.childNodes) {
      child.setTeXclass(null);
    }
    return this;
  }

  /**
   * Adjust the display level, and use prime style in denominator
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    if (!display || level > 0) {
      level++;
    }
    this.childNodes[0].setInheritedAttributes(attributes, false, level, prime);
    this.childNodes[1].setInheritedAttributes(attributes, false, level, true);
  }

} MmlMfrac.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMsqrt node class (subclass of AbstractMmlNode)
 */

class MmlMsqrt extends AbstractMmlNode {constructor(...args) { super(...args); MmlMsqrt.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'msqrt';
  }

  /**
   * <msqrt> has an inferred mrow
   * @override
   */
   get arity() {
    return -1;
  }

  /**
   * <msqrt> can contain line breaks
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    this.childNodes[0].setTeXclass(null);
    return this;
  }

  /**
   * The contents of sqrt are in TeX prime style.
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, _prime) {
    this.childNodes[0].setInheritedAttributes(attributes, display, level, true);
  }

} MmlMsqrt.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMroot node class (subclass of AbstractMmlNode)
 */

class MmlMroot extends AbstractMmlNode {constructor(...args) { super(...args); MmlMroot.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'mroot';
  }

  /**
   * <mroot> requires two children
   * @override
   */
   get arity() {
    return 2;
  }

  /**
   * Set the children display/level/prime for the base and root.
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    this.childNodes[0].setInheritedAttributes(attributes, display, level, true);
    this.childNodes[1].setInheritedAttributes(attributes, false, level + 2, prime);
  }

} MmlMroot.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMstyle node class (subclass of AbstractMmlLayoutNode)
 */

class MmlMstyle extends AbstractMmlLayoutNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlLayoutNode.defaults,
    scriptlevel: INHERIT,
    displaystyle: INHERIT,
    scriptsizemultiplier: 1 / Math.sqrt(2),
    scriptminsize: '8px',  // should be 8pt, but that is too large
    mathbackground: INHERIT,
    mathcolor: INHERIT,
    dir: INHERIT,
    infixlinebreakstyle: 'before'
  };}

  /**
   * @override
   */
   get kind() {
    return 'mstyle';
  }

  /**
   * @override
   */
   get notParent() {
    return true;
  }

  /**
   * Handle scriptlevel changes, and add mstyle attributes to the ones being inherited.
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    let scriptlevel = this.attributes.getExplicit('scriptlevel');
    if (scriptlevel != null) {
      scriptlevel = scriptlevel.toString();
      if (scriptlevel.match(/^\s*[-+]/)) {
        level += parseInt(scriptlevel);
      } else {
        level = parseInt(scriptlevel);
      }
    }
    let displaystyle = this.attributes.getExplicit('displaystyle') ;
    if (displaystyle != null) {
      display = (displaystyle === true);
    }
    attributes = this.addInheritedAttributes(attributes, this.attributes.getAllAttributes());
    this.childNodes[0].setInheritedAttributes(attributes, display, level, prime);
  }

} MmlMstyle.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMerror node class (subclass of AbstractMmlNode)
 */

class MmlMerror extends AbstractMmlNode {constructor(...args) { super(...args); MmlMerror.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'merror';
  }

  /**
   * <merror> gets an inferred mrow
   * @override
   */
   get arity() {
    return -1;
  }

  /**
   * <merror> can contain line breaks
   * @override
   */
   get linebreakContainer() {
    return true;
  }

} MmlMerror.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMpadded node class (subclass of AbstractMmlLayoutNode)
 */

class MmlMpadded extends AbstractMmlLayoutNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlLayoutNode.defaults,
    width: '',
    height: '',
    depth: '',
    lspace: 0,
    voffset: 0
  };}

  /**
   * @override
   */
   get kind() {
    return 'mpadded';
  }

} MmlMpadded.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMphantom node class (subclass of AbstractMmlLayoutNode)
 */

class MmlMphantom extends AbstractMmlLayoutNode {constructor(...args) { super(...args); MmlMphantom.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlLayoutNode.defaults
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'mphantom';
  }

} MmlMphantom.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMfenced node class (subclass of AbstractMmlNode)
 */

class MmlMfenced extends AbstractMmlNode {constructor(...args) { super(...args); MmlMfenced.prototype.__init.call(this);MmlMfenced.prototype.__init2.call(this);MmlMfenced.prototype.__init3.call(this);MmlMfenced.prototype.__init4.call(this); }

  /**
   * @overeride
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults,
    open: '(',
    close: ')',
    separators: ','
  };}

  /**
   * TeX class is INNER
   */
   __init() {this.texClass = TEXCLASS.INNER;}

  /**
   * Storage for "fake" nodes for the separators
   */
   __init2() {this.separators = [];}
  /**
   * Storage for "fake" open node
   */
   __init3() {this.open = null;}
  /**
   * Storage for "fake" close node
   */
   __init4() {this.close = null;}

  /**
   * @override
   */
   get kind() {
    return 'mfenced';
  }

  /**
   * Include the fake nodes in the process, since they will be used
   *  to produce the output.
   *
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    if (this.open) {
      prev = this.open.setTeXclass(prev);
    }
    if (this.childNodes[0]) {
      prev = this.childNodes[0].setTeXclass(prev);
    }
    for (let i = 1, m = this.childNodes.length; i < m; i++) {
      if (this.separators[i - 1]) {
        prev = this.separators[i - 1].setTeXclass(prev);
      }
      if (this.childNodes[i]) {
        prev = this.childNodes[i].setTeXclass(prev);
      }
    }
    if (this.close) {
      prev = this.close.setTeXclass(prev);
    }
    this.updateTeXclass(this.open);
    return prev;
  }

  /**
   * Create the fake nodes and do their inheritance
   * Then do inheridence of usual children
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    this.addFakeNodes();
    for (const child of [this.open, this.close].concat(this.separators)) {
      if (child) {
        child.setInheritedAttributes(attributes, display, level, prime);
      }
    }
    super.setChildInheritedAttributes(attributes, display, level, prime);
  }

  /**
   * Create <mo> elements for the open and close delimiters, and for the separators (if any)
   */
   addFakeNodes() {
    let {open, close, separators} = this.attributes.getList('open', 'close', 'separators') 
;
    open = open.replace(/[ \t\n\r]/g, '');
    close = close.replace(/[ \t\n\r]/g, '');
    separators = separators.replace(/[ \t\n\r]/g, '');
    //
    // Create open node
    //
    if (open) {
      this.open = this.fakeNode(open, {fence: true, form: 'prefix'}, TEXCLASS.OPEN);
    }
    //
    // Create nodes for the separators
    //
    if (separators) {
      while (separators.length < this.childNodes.length - 1) {
        separators += separators.charAt(separators.length - 1);
      }
      let i = 0;
      for (const child of this.childNodes.slice(1)) {
        if (child) {
          this.separators.push(this.fakeNode(separators.charAt(i++)));
        }
      }
    }
    //
    //  Create close node
    //
    if (close) {
      this.close = this.fakeNode(close, {fence: true, form: 'postfix'}, TEXCLASS.CLOSE);
    }
  }

  /**
   * @param {string} c                 The character for the text of the node
   * @param {PropertyList} properties  The attributes for the node
   * @param {number} texClass          The TeX class for the node
   * @return {MmlNode}                 The generated <mo> node
   */
   fakeNode(c, properties = {}, texClass = null) {
    let text = (this.factory.create('text') ).setText(c);
    let node = this.factory.create('mo', properties, [text]);
    node.texClass = texClass;
    node.parent = this;
    return node;
  }

} MmlMfenced.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlEnclose node class (subclass of AbstractMmlNode)
 */

class MmlMenclose extends AbstractMmlNode {constructor(...args) { super(...args); MmlMenclose.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults,
    notation: 'longdiv'
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * The menclose kind
   * @override
   */
   get kind() {
    return 'menclose';
  }

  /**
   * <menclose> has an inferred mrow
   * @override
   */
   get arity() {
    return -1;
  }

  /**
   * <menclose> is a linebreak container
   * @override
   */
   get linebreakContininer() {
    return true;
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    prev = this.childNodes[0].setTeXclass(prev);
    this.updateTeXclass(this.childNodes[0]);
    return prev;
  }

} MmlMenclose.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMaction node class (subclass of AbstractMmlNode)
 */

class MmlMaction extends AbstractMmlNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults,
    actiontype: 'toggle',
    selection: 1
  };}

  /**
   * @override
   */
   get kind() {
    return 'maction';
  }

  /**
   * At least one child
   * @override
   */
   get arity() {
    return 1;
  }

  /**
   * @return {MmlNode}  The selected child node (or an mrow if none selected)
   */
   get selected() {
    const selection = this.attributes.get('selection') ;
    const i = Math.max(1, Math.min(this.childNodes.length, selection)) - 1;
    return this.childNodes[i] || this.factory.create('mrow');
  }

  /**
   * @override
   */
   get isEmbellished() {
    return this.selected.isEmbellished;
  }

  /**
   * @override
   */
   get isSpacelike() {
    return this.selected.isSpacelike;
  }

  /**
   * @override
   */
   core() {
    return this.selected.core();
  }

  /**
   * @override
   */
   coreMO() {
    return this.selected.coreMO();
  }

  /**
   * @override
   */
   verifyAttributes(options) {
    super.verifyAttributes(options);
    if (this.attributes.get('actiontype') !== 'toggle' &&
        this.attributes.getExplicit('selection') !== undefined) {
      const attributes = this.attributes.getAllAttributes();
      delete attributes.selection;
    }
  }

  /**
   * Get the TeX class from the selceted node
   * For tooltips, set TeX classes within the tip as a separate math list
   *
   * @override
   */
   setTeXclass(prev) {
    if (this.attributes.get('actiontype') === 'tooltip' && this.childNodes[1]) {
      this.childNodes[1].setTeXclass(null);
    }
    let selected = this.selected;
    prev = selected.setTeXclass(prev);
    this.updateTeXclass(selected);
    return prev;
  }

  /**
   * Select the next child for a toggle action
   */
   nextToggleSelection() {
    let selection = Math.max(1, (this.attributes.get('selection') ) + 1);
    if (selection > this.childNodes.length) {
      selection = 1;
    }
    this.attributes.set('selection', selection);
  }

} MmlMaction.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMsubsup node class (subclass of AbstractMmlBaseNode)
 */

class MmlMsubsup extends AbstractMmlBaseNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlBaseNode.defaults,
    subscriptshift: '',
    superscriptshift: ''
  };}

  /**
   * @override
   */
   get kind() {
    return 'msubsup';
  }

  /**
   * <msubsup> requires three children
   * @override
   */
   get arity() {
    return 3;
  }

  /**
   * @return {number}  The position of the base element
   */
   get base() {
    return 0;
  }

  /**
   * @return {number}  The position of the subscript (overridden in msup below)
   */
   get sub() {
    return 1;
  }

  /**
   * @return {number}  The position of the superscript (overridden in msup below)
   */
   get sup() {
    return 2;
  }

  /**
   * Super- and subscripts are not in displaymode, have scriptlevel increased, and prime style in subscripts.
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    let nodes = this.childNodes;
    nodes[0].setInheritedAttributes(attributes, display, level, prime);
    nodes[1].setInheritedAttributes(attributes, false, level + 1, prime || this.sub === 1);
    if (!nodes[2]) {
      return;
    }
    nodes[2].setInheritedAttributes(attributes, false, level + 1, prime || this.sub === 2);
  }

} MmlMsubsup.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMsub node class (subclass of MmlMsubsup)
 */

class MmlMsub extends MmlMsubsup {

  /**
   * @override
   */
   static __initStatic2() {this.defaults = {
    ...MmlMsubsup.defaults
  };}

  /**
   * @override
   */
   get kind() {
    return 'msub';
  }

  /**
   * <msub> only gets two children
   * @override
   */
   get arity() {
    return 2;
  }

} MmlMsub.__initStatic2();

/*****************************************************************/
/**
 *  Implements the MmlMsup node class (subclass of MmlMsubsup)
 */

class MmlMsup extends MmlMsubsup {

  /**
   * @override
   */
   static __initStatic3() {this.defaults = {
    ...MmlMsubsup.defaults
  };}

  /**
   * @override
   */
   get kind() {
    return 'msup';
  }

  /**
   * <msup> only gets two children
   * @override
   */
  get arity() {
    return 2;
  }

  /**
   * child 1 is superscript
   * @override
   */
  get sup() {
    return 1;
  }

  /**
   * child 2 is null (no subscript)
   * @override
   */
  get sub() {
    return 2;
  }

} MmlMsup.__initStatic3();

/*****************************************************************/
/**
 *  Implements the MmlMunderover node class (subclass of AbstractMmlNode)
 */

class MmlMunderover extends AbstractMmlBaseNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlBaseNode.defaults,
    accent: false,
    accentunder: false,
    align: 'center'
  };}

  /**
   * The names of attributes controling accents for each child node (reversed for mover below)
   */
   static __initStatic2() {this.ACCENTS = ['', 'accentunder', 'accent'];}

  /**
   * @override
   */
   get kind() {
    return 'munderover';
  }

  /**
   * <munderover> requires three children
   * @override
   */
   get arity() {
    return 3;
  }

  /**
   * @return {number}  The base is child 0
   */
   get base() {
    return 0;
  }

  /**
   * @return {number}  Child 1 goes under (overridden by mover below)
   */
   get under() {
    return 1;
  }

  /**
   * @return {number}  Child 2 goes over (overridden by mover below)
   */
   get over() {
    return 2;
  }

  /**
   * <munderover> can contain line breaks
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * Base is in prime style if there is an over node
   * Force scriptlevel change if converted to sub-sup by movablelimits on the base in non-display mode
   * Adjust displaystyle, scriptlevel, and primestyle for the under/over nodes and check if accent
   *   values have changed due to the inheritance (e.g., settings in operator dictionary)
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    let nodes = this.childNodes;
    nodes[0].setInheritedAttributes(attributes, display, level, prime || !!nodes[this.over]);
    let force = !!(!display && nodes[0].coreMO().attributes.get('movablelimits'));
    let ACCENTS = (this.constructor ).ACCENTS;
    nodes[1].setInheritedAttributes(attributes, false,
                                    this.getScriptlevel(ACCENTS[1], force, level),
                                    prime || this.under === 1);
    this.setInheritedAccent(1, ACCENTS[1], display, level, prime, force);
    if (!nodes[2]) {
      return;
    }
    nodes[2].setInheritedAttributes(attributes, false,
                                    this.getScriptlevel(ACCENTS[2], force, level),
                                    prime || this.under === 2);
    this.setInheritedAccent(2, ACCENTS[2], display, level, prime, force);
  }

  /**
   * @param {string} accent  The name of the accent attribute to check ("accent" or "accentunder")
   * @param {boolean} force  True if the scriptlevel change is to be forced to occur
   * @param {number} level   The current scriptlevel
   * @return {number}        The new script level based on the accent attribute
   */
   getScriptlevel(accent, force, level) {
    if (force || !this.attributes.get(accent)) {
      level++;
    }
    return level;
  }

  /**
   * Check if an under or over accent should cause the appropriate accent attribute to eb inherited
   *   on the munderover node, and if it is not the default, re-inherit the scriptlevel, since that
   *   is affected by the accent attribute
   *
   * @param {number} n         The index of the node to check
   * @param {string} accent    The name of the accent attribute to check ("accent" or "accentunder")
   * @param {boolean} display  The displaystyle
   * @param {number} level     The scriptlevel
   * @param {number} prime     The TeX prime style
   * @param {boolean} force    Whether to force the scriptlevel change
   */
   setInheritedAccent(n, accent, display, level,
                               prime, force) {
    let node = this.childNodes[n];
    if (this.attributes.getExplicit(accent) == null && node.isEmbellished) {
      let value = node.coreMO().attributes.get('accent');
      this.attributes.setInherited(accent, value);
      if (value !== this.attributes.getDefault(accent)) {
        node.setInheritedAttributes({}, display, this.getScriptlevel(accent, force, level), prime);
      }
    }
  }

} MmlMunderover.__initStatic(); MmlMunderover.__initStatic2();

/*****************************************************************/
/**
 *  Implements the MmlMunder node class (subclass of MmlMunderover)
 */

class MmlMunder extends MmlMunderover {

  /**
   * @override
   */
   static __initStatic3() {this.defaults = {
      ...MmlMunderover.defaults
  };}

  /**
   * @override
   */
   get kind() {
    return 'munder';
  }

  /**
   * <munder> has only two children
   * @override
   */
   get arity() {
    return 2;
  }

} MmlMunder.__initStatic3();

/*****************************************************************/
/**
 *  Implements the MmlMover node class (subclass of MmlMunderover)
 */

class MmlMover extends MmlMunderover {

  /**
   * @override
   */
   static __initStatic4() {this.defaults = {
      ...MmlMunderover.defaults
  };}
  /**
   *  The first child is the over accent (second never occurs)
   */
   static __initStatic5() {this.ACCENTS = ['', 'accent', 'accentunder'];}

  /**
   * @override
   */
   get kind() {
    return 'mover';
  }

  /**
   * <mover> has only two children
   * @override
   */
  get arity() {
    return 2;
  }

  /**
   * Child 1 is the over node
   * @override
   */
   get over() {
    return 1;
  }

  /**
   * Child 2 is the null (the under node)
   * @override
   */
   get under() {
    return 2;
  }

} MmlMover.__initStatic4(); MmlMover.__initStatic5();

/*****************************************************************/
/**
 *  Implements the MmlMmultiscripts node class (subclass of MmlMsubsup)
 */

class MmlMmultiscripts extends MmlMsubsup {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...MmlMsubsup.defaults
  };}

  /**
   * @override
   */
   get kind() {
    return 'mmultiscripts';
  }

  /**
   * <mmultiscripts> requires at least one child (the base)
   * @override
   */
   get arity() {
    return 1;
  }

  /**
   * Push the inherited values to the base
   * Make sure the number of pre- and post-scripts are even by adding mrows, if needed.
   * For the scripts, use displaystyle = false, scriptlevel + 1, and
   *   set the primestyle in the subscripts.
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    this.childNodes[0].setInheritedAttributes(attributes, display, level, prime);
    let prescripts = false;
    for (let i = 1, n = 0; i < this.childNodes.length; i++) {
      let child = this.childNodes[i];
      if (child.isKind('mprescripts')) {
        if (!prescripts) {
          prescripts = true;
          if (i % 2 === 0) {
            let mrow = this.factory.create('mrow');
            this.childNodes.splice(i, 0, mrow);
            mrow.parent = this;
            i++;
          }
        }
      } else {
        let primestyle = prime || (n % 2 === 0);
        child.setInheritedAttributes(attributes, false, level + 1, primestyle);
        n++;
      }
    }
    if (this.childNodes.length % 2 === (prescripts ? 1 : 0)) {
      this.appendChild(this.factory.create('mrow'));
      this.childNodes[this.childNodes.length - 1].setInheritedAttributes(attributes, false, level + 1, prime);
    }
  }

  /**
   * Check that mprescripts only occurs once, and that the number of pre- and post-scripts are even.
   *
   * @override
   */
   verifyChildren(options) {
    let prescripts = false;
    let fix = options['fixMmultiscripts'];
    for (let i = 0; i < this.childNodes.length; i++) {
      let child = this.childNodes[i];
      if (child.isKind('mprescripts')) {
        if (prescripts) {
          child.mError(child.kind + ' can only appear once in ' + this.kind, options, true);
        } else {
          prescripts = true;
          if (i % 2 === 0 && !fix) {
            this.mError('There must be an equal number of prescripts of each type', options);
          }
        }
      }
    }
    if (this.childNodes.length % 2 === (prescripts ? 1 : 0) && !fix) {
      this.mError('There must be an equal number of scripts of each type', options);
    }
    super.verifyChildren(options);
  }

} MmlMmultiscripts.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMprescripts node class (subclass of AbstractMmlNode)
 */

class MmlMprescripts extends AbstractMmlNode {

  /**
   * @override
   */
   static __initStatic2() {this.defaults = {
    ...AbstractMmlNode.defaults
  };}

  /**
   * @return {string}  The mprescripts kind
   */
   get kind() {
    return 'mprescripts';
  }

  /**
   * @return {number}  <mprescripts> can have no children
   */
   get arity() {
    return 0;
  }

  /**
   * Check that parent is mmultiscripts
   *
   * @override
   */
   verifyTree(options) {
    super.verifyTree(options);
    if (this.parent && !this.parent.isKind('mmultiscripts')) {
      this.mError(this.kind + ' must be a child of mmultiscripts', options, true);
    }
  }

} MmlMprescripts.__initStatic2();

/*****************************************************************/
/**
 *  Implements the MmlNone node class (subclass of AbstractMmlNode)
 */

class MmlNone extends AbstractMmlNode {

  /**
   * @override
   */
   static __initStatic3() {this.defaults = {
    ...AbstractMmlNode.defaults
  };}

  /**
   * @return {string}  The none kind
   */
   get kind() {
    return 'none';
  }

  /**
   * @return {number}  <none> can have no children
   */
   get arity() {
    return 0;
  }

  /**
   * Check that parent is mmultiscripts
   *
   * @override
   */
   verifyTree(options) {
    super.verifyTree(options);
    if (this.parent && !this.parent.isKind('mmultiscripts')) {
      this.mError(this.kind + ' must be a child of mmultiscripts', options, true);
    }
  }

} MmlNone.__initStatic3();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * Convert a UTF-8 string to an array of unicode code points
 *
 * @param {string} text  The string to be turned into unicode positions
 * @return {number[]}  Array of numbers representing the string's unicode character positions
 */
function unicodeChars(text) {
  return Array.from(text).map((c) => c.codePointAt(0));
}

/**
 * Test if a value is a percentage
 *
 * @param {string} x   The string to test
 * @return {boolean}   True if the string ends with a percent sign
 */
function isPercent(x) {
  return !!x.match(/%\s*$/);
}

/**
 * Split a space-separated string of values
 *
 * @param {string} x   The string to be split
 * @return {string[]}  The list of white-space-separated "words" in the string
 */
function split(x) {
  return x.trim().split(/\s+/);
}

/*****************************************************************/
/**
 *  Implements the MmlMtable node class (subclass of AbstractMmlNode)
 */

class MmlMtable extends AbstractMmlNode {constructor(...args) { super(...args); MmlMtable.prototype.__init.call(this);MmlMtable.prototype.__init2.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults,
    align: 'axis',
    rowalign: 'baseline',
    columnalign: 'center',
    groupalign: '{left}',
    alignmentscope: true,
    columnwidth: 'auto',
    width: 'auto',
    rowspacing: '1ex',
    columnspacing: '.8em',
    rowlines: 'none',
    columnlines: 'none',
    frame: 'none',
    framespacing: '0.4em 0.5ex',
    equalrows: false,
    equalcolumns: false,
    displaystyle: false,
    side: 'right',
    minlabelspacing: '0.8em'
  };}

  /**
   * Extra properties for this node
   */
   __init() {this.properties = {
    useHeight: 1
  };}

  /**
   * TeX class is ORD
   */
   __init2() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'mtable';
  }

  /**
   * Linebreaks are allowed in tables
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * @override
   */
   setInheritedAttributes(attributes, display, level, prime) {
    //
    // Force inheritance of shift and align values (since they are needed to output tables with labels)
    //   but make sure they are not given explicitly on the <mtable> tag.
    //
    for (const name of indentAttributes) {
      if (attributes[name]) {
        this.attributes.setInherited(name, attributes[name][1]);
      }
      if (this.attributes.getExplicit(name) !== undefined) {
        delete (this.attributes.getAllAttributes())[name];
      }
    }
    super.setInheritedAttributes(attributes, display, level, prime);
  }

  /**
   * Make sure all children are mtr or mlabeledtr nodes
   * Inherit the table attributes, and set the display attribute based on the table's displaystyle attribute
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    for (const child of this.childNodes) {
      if (!child.isKind('mtr')) {
        this.replaceChild(this.factory.create('mtr'), child)
          .appendChild(child);
      }
    }
    display = !!(this.attributes.getExplicit('displaystyle') || this.attributes.getDefault('displaystyle'));
    attributes = this.addInheritedAttributes(attributes, {
      columnalign: this.attributes.get('columnalign'),
      rowalign: 'center'
    });
    const ralign = split(this.attributes.get('rowalign') );
    for (const child of this.childNodes) {
      attributes.rowalign[1] = ralign.shift() || attributes.rowalign[1];
      child.setInheritedAttributes(attributes, display, level, prime);
    }
  }

  /**
   * Check that children are mtr or mlabeledtr
   *
   * @override
   */
   verifyChildren(options) {
    if (!options['fixMtables']) {
      for (const child of this.childNodes) {
        if (!child.isKind('mtr')) {
          this.mError('Children of ' + this.kind + ' must be mtr or mlabeledtr', options);
        }
      }
    }
    super.verifyChildren(options);
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    for (const child of this.childNodes) {
      child.setTeXclass(null);
    }
    return this;
  }

} MmlMtable.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMtr node class (subclass of AbstractMmlNode)
 */

class MmlMtr extends AbstractMmlNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults,
    rowalign: INHERIT,
    columnalign: INHERIT,
    groupalign: INHERIT
  };}

  /**
   * @override
   */
   get kind() {
    return 'mtr';
  }

  /**
   * <mtr> can contain linebreaks
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * Inherit the mtr attributes
   *
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    for (const child of this.childNodes) {
      if (!child.isKind('mtd')) {
        this.replaceChild(this.factory.create('mtd'), child)
            .appendChild(child);
      }
    }
    const calign = split(this.attributes.get('columnalign') );
    if (this.arity === 1) {
      calign.unshift(this.parent.attributes.get('side') );
    }
    attributes = this.addInheritedAttributes(attributes, {
      rowalign: this.attributes.get('rowalign'),
      columnalign: 'center'
    });
    for (const child of this.childNodes) {
      attributes.columnalign[1] = calign.shift() || attributes.columnalign[1];
      child.setInheritedAttributes(attributes, display, level, prime);
    }
  }

  /**
   * Check that parent is mtable and children are mtd
   *
   * @override
   */
   verifyChildren(options) {
    if (this.parent && !this.parent.isKind('mtable')) {
      this.mError(this.kind + ' can only be a child of an mtable', options, true);
      return;
    }
    if (!options['fixMtables']) {
      for (const child of this.childNodes) {
        if (!child.isKind('mtd')) {
          let mtr = this.replaceChild(this.factory.create('mtr'), child) ;
          mtr.mError('Children of ' + this.kind + ' must be mtd', options, true);
        }
      }
    }
    super.verifyChildren(options);
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    for (const child of this.childNodes) {
      child.setTeXclass(null);
    }
    return this;
  }

} MmlMtr.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMlabeledtr node class (subclass of MmlMtr)
 */

class MmlMlabeledtr extends MmlMtr {

  /**
   * @override
   */
   get kind() {
    return 'mlabeledtr';
  }

  /**
   * <mlabeledtr> requires at least one child (the label)
   * @override
   */
  get arity() {
    return 1;
  }

}

/*****************************************************************/
/**
 *  Implements the MmlMtd node class (subclass of AbstractMmlBaseNode)
 */

class MmlMtd extends AbstractMmlBaseNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlBaseNode.defaults,
    rowspan: 1,
    columnspan: 1,
    rowalign: INHERIT,
    columnalign: INHERIT,
    groupalign: INHERIT
  };}

  /**
   * @override
   */
   get kind() {
    return 'mtd';
  }

  /**
   * <mtd> has an inferred mrow
   * @overrride
   */
   get arity() {
    return -1;
  }

  /**
   * <mtd> can contain line breaks
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * Check that parent is mtr
   *
   * @override
   */
   verifyChildren(options) {
    if (this.parent && !this.parent.isKind('mtr')) {
      this.mError(this.kind + ' can only be a child of an mtr or mlabeledtr', options, true);
      return;
    }
    super.verifyChildren(options);
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    this.childNodes[0].setTeXclass(null);
    return this;
  }

} MmlMtd.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMaligngroup node class (subclass of AbstractMmlNode)
 */

class MmlMaligngroup extends AbstractMmlLayoutNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlLayoutNode.defaults,
    groupalign: INHERIT
  };}

  /**
   * @override
   */
   get kind() {
    return 'maligngroup';
  }

  /**
   * <maligngroup> is space-like
   * @override
   */
   get isSpacelike() {
    return true;
  }

  /**
   * Children can inherit from <maligngroup>
   * @override
   */
   setChildInheritedAttributes(attributes, display, level, prime) {
    attributes = this.addInheritedAttributes(attributes, this.attributes.getAllAttributes());
    super.setChildInheritedAttributes(attributes, display, level, prime);
  }

} MmlMaligngroup.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMalignmark node class (subclass of AbstractMmlNode)
 */

class MmlMalignmark extends AbstractMmlNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults,
    edge: 'left'
  };}

  /**
   * @override
   */
   get kind() {
    return 'malignmark';
  }

  /**
   * No children allowed
   * @override
   */
   get arity() {
    return 0;
  }

  /**
   * <malignmark> is space-like
   * @override
   */
   get isSpacelike() {
    return true;
  }

} MmlMalignmark.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMglyph node class (subclass of AbstractMmlTokenNode)
 */

class MmlMglyph extends AbstractMmlTokenNode {constructor(...args) { super(...args); MmlMglyph.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlTokenNode.defaults,
    alt: '',
    src: '',
    width: 'auto',
    height: 'auto',
    valign: '0em'
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'mglyph';
  }

} MmlMglyph.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMroot node class (subclass of AbstractMmlBaseNode)
 */

class MmlSemantics extends AbstractMmlBaseNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlBaseNode.defaults,
    definitionUrl: null,
    encoding: null
  };}

  /**
   * @override
   */
   get kind() {
    return 'semantics';
  }

  /**
   * <semantics> requires at least one node
   * @override
   */
   get arity() {
    return 1;
  }

  /**
   * Ignore <semantics> when looking for partent node
   * @override
   */
   get notParent() {
    return true;
  }

} MmlSemantics.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMroot node class (subclass of AbstractMmlNode)
 */

class MmlAnnotationXML extends AbstractMmlNode {

  /**
   * @override
   */
   static __initStatic2() {this.defaults = {
    ...AbstractMmlNode.defaults,
    definitionUrl: null,
    encoding: null,
    cd: 'mathmlkeys',
    name: '',
    src: null
  };}

  /**
   * @override
   */
   get kind() {
    return 'annotation-xml';
  }

  /**
   * Children are XMLNodes, so don't bother inheritting to them
   * @override
   */
   setChildInheritedAttributes() {}

} MmlAnnotationXML.__initStatic2();

/*****************************************************************/
/**
 *  Implements the MmlMroot node class (subclass of MmlAnnotationXML)
 */

class MmlAnnotation extends MmlAnnotationXML {constructor(...args) { super(...args); MmlAnnotation.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic3() {this.defaults = {
    ...MmlAnnotationXML.defaults
  };}

  /**
   * Extra properties for this node
   */
   __init() {this.properties = {
    isChars: true
  };}

  /**
   * @override
   */
   get kind() {
    return 'annotation';
  }

} MmlAnnotation.__initStatic3();

/*****************************************************************/
/**
 *  Implements the TeXAtom node class (subclass of AbstractMmlBaseNode)
 */

class TeXAtom extends AbstractMmlBaseNode {constructor(...args) { super(...args); TeXAtom.prototype.__init.call(this); }

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlBaseNode.defaults
  };}

  /**
   * TeX class is ORD
   */
   __init() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return 'TeXAtom';
  }

  /**
   * Inferred mrow with any number of children
   * @override
   */
   get arity() {
    return -1;
  }

  /**
   * This element is not considered a MathML container
   * @override
   */
   get notParent() {
    return true;
  }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.childNodes[0].setTeXclass(null);
    return this.adjustTeXclass(prev);
  }

  /**
   * (Replaced below by the version from the MmlMo node)
   *
   * @override
   */
   adjustTeXclass(prev) {
    return prev;
  }

} TeXAtom.__initStatic();
/**
 *  Use the method from the MmlMo class
 */
TeXAtom.prototype.adjustTeXclass = MmlMo.prototype.adjustTeXclass;

/*****************************************************************/
/**
 *  Implements the MathChoice node class (subclass of AbstractMmlBaseNode)
 *
 *  This is used by TeX's \mathchoice macro, but removes itself
 *  during the setInheritedAttributes process
 */

class MathChoice extends AbstractMmlBaseNode {

  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlBaseNode.defaults
  };}

  /**
   *  @override
   */
   get kind() {
    return 'MathChoice';
  }

  /**
   * 4 children (display, text, script, and scriptscript styles)
   * @override
   */
   get arity() {
    return 4;
  }

  /**
   * This element is not considered a MathML container
   * @override
   */
   get notParent() {
    return true;
  }

  /**
   * Replace the MathChoice node with the selected on based on the displaystyle and scriptlevel settings
   * (so the MathChoice never ends up in a finished MmlNode tree)
   *
   * @override
   */
   setInheritedAttributes(attributes, display, level, prime) {
    const selection = (display ? 0 : Math.max(0, Math.min(level, 2)) + 1);
    const child = this.childNodes[selection] || this.factory.create('mrow');
    this.parent.replaceChild(child, this);
    child.setInheritedAttributes(attributes, display, level, prime);
  }

} MathChoice.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMtable node class (subclass of AbstractMmlNode)
 */

class MmlMstack extends AbstractMmlNode {constructor(...args) { super(...args); MmlMstack.prototype.__init.call(this);MmlMstack.prototype.__init2.call(this); }
  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults,
    align: "axis",
    stackalign: "right",
    charalign: "center",
    charspacing: "medium",
  };}

  /**
   * Extra properties for this node
   */
   __init() {this.properties = {
    useHeight: 1,
  };}

  /**
   * TeX class is ORD
   */
   __init2() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return "mstack";
  }

  /**
   * Linebreaks are allowed in tables
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * @override
   */
  // public setInheritedAttributes(
  //   attributes: AttributeList,
  //   display: boolean,
  //   level: number,
  //   prime: boolean
  // ) {
  //   //
  //   // Force inheritance of shift and align values (since they are needed to output tables with labels)
  //   //   but make sure they are not given explicitly on the <mtable> tag.
  //   //
  //   for (const name of indentAttributes) {
  //     if (attributes[name]) {
  //       this.attributes.setInherited(name, attributes[name][1]);
  //     }
  //     if (this.attributes.getExplicit(name) !== undefined) {
  //       delete this.attributes.getAllAttributes()[name];
  //     }
  //   }
  //   super.setInheritedAttributes(attributes, display, level, prime);
  // }

  /**
   * Make sure all children are mtr or mlabeledtr nodes
   * Inherit the table attributes, and set the display attribute based on the table's displaystyle attribute
   *
   * @override
   */
  // protected setChildInheritedAttributes(
  //   attributes: AttributeList,
  //   display: boolean,
  //   level: number,
  //   prime: boolean
  // ) {
  //   for (const child of this.childNodes) {
  //     if (!child.isKind("mtr")) {
  //       this.replaceChild(this.factory.create("mtr"), child).appendChild(child);
  //     }
  //   }
  //   display = !!(
  //     this.attributes.getExplicit("displaystyle") ||
  //     this.attributes.getDefault("displaystyle")
  //   );
  //   attributes = this.addInheritedAttributes(attributes, {
  //     columnalign: this.attributes.get("columnalign"),
  //     rowalign: "center",
  //   });
  //   const ralign = split(this.attributes.get("rowalign") as string);
  //   for (const child of this.childNodes) {
  //     attributes.rowalign[1] = ralign.shift() || attributes.rowalign[1];
  //     child.setInheritedAttributes(attributes, display, level, prime);
  //   }
  // }

  /**
   * Check that children are mtr or mlabeledtr
   *
   * @override
   */
  // protected verifyChildren(options: PropertyList) {
  //   if (!options["fixMtables"]) {
  //     for (const child of this.childNodes) {
  //       if (!child.isKind("mtr")) {
  //         this.mError(
  //           "Children of " + this.kind + " must be mtr or mlabeledtr",
  //           options
  //         );
  //       }
  //     }
  //   }
  //   super.verifyChildren(options);
  // }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    for (const child of this.childNodes) {
      child.setTeXclass(null);
    }
    return this;
  }
} MmlMstack.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMtable node class (subclass of AbstractMmlNode)
 */

class MmlMsrow extends AbstractMmlNode {constructor(...args) { super(...args); MmlMsrow.prototype.__init.call(this);MmlMsrow.prototype.__init2.call(this); }
  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults,
    align: "axis",
    stackalign: "right",
    charalign: "center",
    charspacing: "medium",
  };}

  /**
   * Extra properties for this node
   */
   __init() {this.properties = {
    useHeight: 1,
  };}

  /**
   * TeX class is ORD
   */
   __init2() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return "msrow";
  }

  /**
   * Linebreaks are allowed in tables
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * @override
   */
  // public setInheritedAttributes(
  //   attributes: AttributeList,
  //   display: boolean,
  //   level: number,
  //   prime: boolean
  // ) {
  //   //
  //   // Force inheritance of shift and align values (since they are needed to output tables with labels)
  //   //   but make sure they are not given explicitly on the <mtable> tag.
  //   //
  //   for (const name of indentAttributes) {
  //     if (attributes[name]) {
  //       this.attributes.setInherited(name, attributes[name][1]);
  //     }
  //     if (this.attributes.getExplicit(name) !== undefined) {
  //       delete this.attributes.getAllAttributes()[name];
  //     }
  //   }
  //   super.setInheritedAttributes(attributes, display, level, prime);
  // }

  /**
   * Make sure all children are mtr or mlabeledtr nodes
   * Inherit the table attributes, and set the display attribute based on the table's displaystyle attribute
   *
   * @override
   */
  // protected setChildInheritedAttributes(
  //   attributes: AttributeList,
  //   display: boolean,
  //   level: number,
  //   prime: boolean
  // ) {
  //   for (const child of this.childNodes) {
  //     if (!child.isKind("mtr")) {
  //       this.replaceChild(this.factory.create("mtr"), child).appendChild(child);
  //     }
  //   }
  //   display = !!(
  //     this.attributes.getExplicit("displaystyle") ||
  //     this.attributes.getDefault("displaystyle")
  //   );
  //   attributes = this.addInheritedAttributes(attributes, {
  //     columnalign: this.attributes.get("columnalign"),
  //     rowalign: "center",
  //   });
  //   const ralign = split(this.attributes.get("rowalign") as string);
  //   for (const child of this.childNodes) {
  //     attributes.rowalign[1] = ralign.shift() || attributes.rowalign[1];
  //     child.setInheritedAttributes(attributes, display, level, prime);
  //   }
  // }

  /**
   * Check that children are mtr or mlabeledtr
   *
   * @override
   */
  // protected verifyChildren(options: PropertyList) {
  //   if (!options["fixMtables"]) {
  //     for (const child of this.childNodes) {
  //       if (!child.isKind("mtr")) {
  //         this.mError(
  //           "Children of " + this.kind + " must be mtr or mlabeledtr",
  //           options
  //         );
  //       }
  //     }
  //   }
  //   super.verifyChildren(options);
  // }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    for (const child of this.childNodes) {
      child.setTeXclass(null);
    }
    return this;
  }
} MmlMsrow.__initStatic();

/*****************************************************************/
/**
 *  Implements the MmlMtable node class (subclass of AbstractMmlNode)
 */

class MmlMsline extends AbstractMmlNode {constructor(...args) { super(...args); MmlMsline.prototype.__init.call(this);MmlMsline.prototype.__init2.call(this); }
  /**
   * @override
   */
   static __initStatic() {this.defaults = {
    ...AbstractMmlNode.defaults,
    align: "axis",
    stackalign: "right",
    charalign: "center",
    charspacing: "medium",
  };}

  /**
   * Extra properties for this node
   */
   __init() {this.properties = {
    useHeight: 1,
  };}

  /**
   * TeX class is ORD
   */
   __init2() {this.texClass = TEXCLASS.ORD;}

  /**
   * @override
   */
   get kind() {
    return "msline";
  }

  /**
   * Linebreaks are allowed in tables
   * @override
   */
   get linebreakContainer() {
    return true;
  }

  /**
   * @override
   */
  // public setInheritedAttributes(
  //   attributes: AttributeList,
  //   display: boolean,
  //   level: number,
  //   prime: boolean
  // ) {
  //   //
  //   // Force inheritance of shift and align values (since they are needed to output tables with labels)
  //   //   but make sure they are not given explicitly on the <mtable> tag.
  //   //
  //   for (const name of indentAttributes) {
  //     if (attributes[name]) {
  //       this.attributes.setInherited(name, attributes[name][1]);
  //     }
  //     if (this.attributes.getExplicit(name) !== undefined) {
  //       delete this.attributes.getAllAttributes()[name];
  //     }
  //   }
  //   super.setInheritedAttributes(attributes, display, level, prime);
  // }

  /**
   * Make sure all children are mtr or mlabeledtr nodes
   * Inherit the table attributes, and set the display attribute based on the table's displaystyle attribute
   *
   * @override
   */
  // protected setChildInheritedAttributes(
  //   attributes: AttributeList,
  //   display: boolean,
  //   level: number,
  //   prime: boolean
  // ) {
  //   for (const child of this.childNodes) {
  //     if (!child.isKind("mtr")) {
  //       this.replaceChild(this.factory.create("mtr"), child).appendChild(child);
  //     }
  //   }
  //   display = !!(
  //     this.attributes.getExplicit("displaystyle") ||
  //     this.attributes.getDefault("displaystyle")
  //   );
  //   attributes = this.addInheritedAttributes(attributes, {
  //     columnalign: this.attributes.get("columnalign"),
  //     rowalign: "center",
  //   });
  //   const ralign = split(this.attributes.get("rowalign") as string);
  //   for (const child of this.childNodes) {
  //     attributes.rowalign[1] = ralign.shift() || attributes.rowalign[1];
  //     child.setInheritedAttributes(attributes, display, level, prime);
  //   }
  // }

  /**
   * Check that children are mtr or mlabeledtr
   *
   * @override
   */
  // protected verifyChildren(options: PropertyList) {
  //   if (!options["fixMtables"]) {
  //     for (const child of this.childNodes) {
  //       if (!child.isKind("mtr")) {
  //         this.mError(
  //           "Children of " + this.kind + " must be mtr or mlabeledtr",
  //           options
  //         );
  //       }
  //     }
  //   }
  //   super.verifyChildren(options);
  // }

  /**
   * @override
   */
   setTeXclass(prev) {
    this.getPrevClass(prev);
    for (const child of this.childNodes) {
      child.setTeXclass(null);
    }
    return this;
  }
} MmlMsline.__initStatic();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/************************************************************************/
/**
 *  This object collects all the MathML node types together so that
 *  they can be used to seed an MmlNodeFactory.  One could copy this
 *  object to override existing classes with subclasses, or to add new
 *  classes as necessary.
 */
let MML = {
  [MmlMstack.prototype.kind]: MmlMstack,
  [MmlMsrow.prototype.kind]: MmlMsrow,
  [MmlMsline.prototype.kind]: MmlMsline,
  [MmlMath.prototype.kind]: MmlMath,

  [MmlMi.prototype.kind]: MmlMi,
  [MmlMn.prototype.kind]: MmlMn,
  [MmlMo.prototype.kind]: MmlMo,
  [MmlMtext.prototype.kind]: MmlMtext,
  [MmlMspace.prototype.kind]: MmlMspace,
  [MmlMs.prototype.kind]: MmlMs,

  [MmlMrow.prototype.kind]: MmlMrow,
  [MmlInferredMrow.prototype.kind]: MmlInferredMrow,
  [MmlMfrac.prototype.kind]: MmlMfrac,
  [MmlMsqrt.prototype.kind]: MmlMsqrt,
  [MmlMroot.prototype.kind]: MmlMroot,
  [MmlMstyle.prototype.kind]: MmlMstyle,
  [MmlMerror.prototype.kind]: MmlMerror,
  [MmlMpadded.prototype.kind]: MmlMpadded,
  [MmlMphantom.prototype.kind]: MmlMphantom,
  [MmlMfenced.prototype.kind]: MmlMfenced,
  [MmlMenclose.prototype.kind]: MmlMenclose,

  [MmlMaction.prototype.kind]: MmlMaction,

  [MmlMsub.prototype.kind]: MmlMsub,
  [MmlMsup.prototype.kind]: MmlMsup,
  [MmlMsubsup.prototype.kind]: MmlMsubsup,
  [MmlMunder.prototype.kind]: MmlMunder,
  [MmlMover.prototype.kind]: MmlMover,
  [MmlMunderover.prototype.kind]: MmlMunderover,
  [MmlMmultiscripts.prototype.kind]: MmlMmultiscripts,
  [MmlMprescripts.prototype.kind]: MmlMprescripts,
  [MmlNone.prototype.kind]: MmlNone,

  [MmlMtable.prototype.kind]: MmlMtable,
  [MmlMlabeledtr.prototype.kind]: MmlMlabeledtr,
  [MmlMtr.prototype.kind]: MmlMtr,
  [MmlMtd.prototype.kind]: MmlMtd,
  [MmlMaligngroup.prototype.kind]: MmlMaligngroup,
  [MmlMalignmark.prototype.kind]: MmlMalignmark,

  [MmlMglyph.prototype.kind]: MmlMglyph,

  [MmlSemantics.prototype.kind]: MmlSemantics,
  [MmlAnnotation.prototype.kind]: MmlAnnotation,
  [MmlAnnotationXML.prototype.kind]: MmlAnnotationXML,

  [TeXAtom.prototype.kind]: TeXAtom,
  [MathChoice.prototype.kind]: MathChoice,

  [TextNode.prototype.kind]: TextNode,
  [XMLNode.prototype.kind]: XMLNode,
};

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 *  Implements the MmlFactory (subclass of NodeFactory)
 */

class MmlFactory extends AbstractNodeFactory {

  /**
   * The default node-creation functions
   */
   static __initStatic() {this.defaultNodes = MML;}

  /**
   * @return {Object}  The list of node-creation functions (similar to the
   *                   MML object from MathJax v2).
   */
  get MML() {
    return this.node;
  }

} MmlFactory.__initStatic();

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements bit-fields with extendable field names
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

class BitField {constructor() { BitField.prototype.__init.call(this); }

  /**
   * The largest bit available
   */
   static __initStatic() {this.MAXBIT = 1 << 31;}

  /**
   * The next bit to be allocated
   */
   static __initStatic2() {this.next = 1;}

  /**
   * The map of names to bit positions
   */
   static __initStatic3() {this.names = new Map();}

  /**
   * The bits that are set
   */
   __init() {this.bits = 0;}

  /**
   * @param {string} names    The names of the bit positions to reserve
   */
   static allocate(...names) {
    for (const name of names) {
      if (this.has(name)) {
        throw new Error('Bit already allocated for ' + name);
      }
      if (this.next === BitField.MAXBIT) {
        throw new Error('Maximum number of bits already allocated');
      }
      this.names.set(name, this.next);
      this.next <<= 1;
    }
  }

  /**
   * @param {string} name   The name of the bit to check for being defined
   * @return {boolean}      True if the named bit is already allocated
   */
   static has(name) {
    return this.names.has(name);
  }

  /**
   * @param {string} name    The name of the bit position to set
   */
   set(name) {
    this.bits |= this.getBit(name);
  }

  /**
   * @param {string} name    The name of the bit position to clear
   */
   clear(name) {
    this.bits &= ~this.getBit(name);
  }

  /**
   * @param {string} name   The name of the bit to check if set
   * @return {boolean}      True if the named bit is set
   */
   isSet(name) {
    return !!(this.bits & this.getBit(name));
  }

  /**
   * Clear all bits
   */
   reset() {
    this.bits = 0;
  }

  /**
   * @param {string} name   The name whose bit position is needed (error if not defined)
   * @return {number}       The position of the named bit
   */
   getBit(name) {
    const bit = (this.constructor ).names.get(name);
    if (!bit) {
      throw new Error('Unknown bit-field name: ' + name);
    }
    return bit;
  }

} BitField.__initStatic(); BitField.__initStatic2(); BitField.__initStatic3();

/**
 * @param {string[]} names    The name of the positions to allocate initially
 * @return {typeof AbstractBitField}  The bit-field class with names allocated
 */
function BitFieldClass(...names) {
  const Bits = class extends BitField {};
  Bits.allocate(...names);
  return Bits;
}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/

/**
 * A function to call while rendering a document (usually calls a MathDocument method)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */






















































/**
 * Implements a prioritized list of render actions.  Extensions can add actions to the list
 *   to make it easy to extend the normal typesetting and conversion operations.
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class RenderList extends PrioritizedList {

  /**
   * Creates a new RenderList from an initial list of rendering actions
   *
   * @param {RenderActions} actions The list of actions to take during render(), rerender(), and convert() calls
   * @returns {RenderList}    The newly created prioritied list
   */
   static create(actions) {
    const list = new this();
    for (const id of Object.keys(actions)) {
      const [action, priority] = this.action(id, actions[id]);
      if (priority) {
        list.add(action, priority);
      }
    }
    return list;
  }

  /**
   * Parses a RenderAction to produce the correspinding RenderData item
   *  (e.g., turn method names into actual functions that call the method)
   *
   * @param {string} id               The id of the action
   * @param {RenderAction} action     The RenderAction defining the action
   * @returns {[RenderData,number]}   The corresponding RenderData definition for the action and its priority
   */
   static action(id, action) {
    let renderDoc, renderMath;
    let convert = true;
    let priority = action[0];
    if (action.length === 1 || typeof action[1] === 'boolean') {
      action.length === 2 && (convert = action[1] );
      [renderDoc, renderMath] = this.methodActions(id);
    } else if (typeof action[1] === 'string') {
      if (typeof action[2] === 'string') {
        action.length === 4 && (convert = action[3] );
        const [method1, method2] = action.slice(1) ;
        [renderDoc, renderMath] = this.methodActions(method1, method2);
      } else {
        action.length === 3 && (convert = action[2] );
        [renderDoc, renderMath] = this.methodActions(action[1] );
      }
    } else {
      action.length === 4 && (convert = action[3] );
      [renderDoc, renderMath] = action.slice(1) ;
    }
    return [{id, renderDoc, renderMath, convert} , priority];
  }

  /**
   * Produces the doc and math actions for the given method name(s)
   *   (a blank name is a no-op)
   *
   * @param {string} method1    The method to use for the render() call
   * @param {string} method1    The method to use for the rerender() and convert() calls
   */
   static methodActions(method1, method2 = method1) {
    return [
      (document) => {method1 && document[method1](); return false; },
      (math, document) => {method2 && math[method2](document); return false; }
    ];
  }

  /**
   * Perform the document-level rendering functions
   *
   * @param {MathDocument} document   The MathDocument whose methods are to be called
   * @param {number=} start           The state at which to start rendering (default is UNPROCESSED)
   */
   renderDoc(document, start = STATE.UNPROCESSED) {
    for (const item of this.items) {
      if (item.priority >= start) {
        if (item.item.renderDoc(document)) return;
      }
    }
  }

  /**
   * Perform the MathItem-level rendering functions
   *
   * @param {MathItem} math           The MathItem whose methods are to be called
   * @param {MathDocument} document   The MathDocument to pass to the MathItem methods
   * @param {number=} start           The state at which to start rendering (default is UNPROCESSED)
   */
   renderMath(math, document, start = STATE.UNPROCESSED) {
    for (const item of this.items) {
      if (item.priority >= start) {
        if (item.item.renderMath(math, document)) return;
      }
    }
  }

  /**
   * Perform the MathItem-level conversion functions
   *
   * @param {MathItem} math           The MathItem whose methods are to be called
   * @param {MathDocument} document   The MathDocument to pass to the MathItem methods
   * @param {number=} end             The state at which to end rendering (default is LAST)
   */
   renderConvert(math, document, end = STATE.LAST) {
    for (const item of this.items) {
      if (item.priority > end) return;
      if (item.item.convert) {
        if (item.item.renderMath(math, document)) return;
      }
    }
  }

  /**
   * Find an entry in the list with a given ID
   *
   * @param {string} id            The id to search for
   * @returns {RenderData|null}   The data for the given id, if found, or null
   */
   findID(id) {
    for (const item of this.items) {
      if (item.item.id === id) {
        return item.item;
      }
    }
    return null;
  }

}

/*****************************************************************/
/**
 * The ways of specifying a container (a selector string, an actual node,
 * or an array of those (e.g., the result of document.getElementsByTagName())
 *
 * @template N  The HTMLElement node class
 */




























































































































































































































/*****************************************************************/

/**
 * Defaults used when input jax isn't specified
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class DefaultInputJax extends AbstractInputJax {
  /**
   * @override
   */
   compile(_math) {
    return null ;
  }
}

/**
 * Defaults used when ouput jax isn't specified
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class DefaultOutputJax extends AbstractOutputJax {
  /**
   * @override
   */
   typeset(_math, _document = null) {
    return null ;
  }
  /**
   * @override
   */
   escaped(_math, _document) {
    return null ;
  }
}

/**
 * Default for the MathList when one isn't specified
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class DefaultMathList extends AbstractMathList {}

/**
 * Default for the Mathitem when one isn't specified
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class DefaultMathItem extends AbstractMathItem {}

/*****************************************************************/
/**
 *  Implements the abstract MathDocument class
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class AbstractMathDocument {

  /**
   * The type of MathDocument
   */
   static __initStatic() {this.KIND = 'MathDocument';}

  /**
   * The default options for the document
   */
   static __initStatic2() {this.OPTIONS = {
    OutputJax: null,           // instance of an OutputJax for the document
    InputJax: null,            // instance of an InputJax or an array of them
    MmlFactory: null,          // instance of a MmlFactory for this document
    MathList: DefaultMathList, // constructor for a MathList to use for the document
    MathItem: DefaultMathItem, // constructor for a MathItem to use for the MathList
    compileError: (doc, math, err) => {
      doc.compileError(math, err);
    },
    typesetError: (doc, math, err) => {
      doc.typesetError(math, err);
    },
    renderActions: expandable({
      find:    [STATE.FINDMATH, 'findMath', '', false],
      compile: [STATE.COMPILED],
      metrics: [STATE.METRICS, 'getMetrics', '', false],
      typeset: [STATE.TYPESET],
      update:  [STATE.INSERTED, 'updateDocument', false]
    }) 
  };}

  /**
   * A bit-field for the actions that have been processed
   */
   static __initStatic3() {this.ProcessBits = BitFieldClass('findMath', 'compile', 'getMetrics', 'typeset', 'updateDocument');}

  /**
   * The document managed by this MathDocument
   */
  
  /**
   * The actual options for this document (with user-supplied ones merged in)
   */
  

  /**
   * The list of MathItems for this document
   */
  

  /**
   * The list of render actions
   */
  

  /**
   * The bit-field used to tell what steps have been taken on the document (for retries)
   */
  

  /**
   * The list of input jax for the document
   */
  

  /**
   * The output jax for the document
   */
  

  /**
   * The DOM adaptor for the document
   */
  

  /**
   * The MathML node factory for the internal MathML representation
   */
  


  /**
   * @param {any} document           The document (HTML string, parsed DOM, etc.) to be processed
   * @param {DOMAdaptor} adaptor     The DOM adaptor for this document
   * @param {OptionList} options     The options for this document
   * @constructor
   */
  constructor (document, adaptor, options) {
    let CLASS = this.constructor ;
    this.document = document;
    this.options = userOptions(defaultOptions({}, CLASS.OPTIONS), options);
    this.math = new (this.options['MathList'] || DefaultMathList)();
    this.renderActions = RenderList.create(this.options['renderActions']);
    this.processed = new AbstractMathDocument.ProcessBits();
    this.outputJax = this.options['OutputJax'] || new DefaultOutputJax();
    let inputJax = this.options['InputJax'] || [new DefaultInputJax()];
    if (!Array.isArray(inputJax)) {
      inputJax = [inputJax];
    }
    this.inputJax = inputJax;
    //
    // Pass the DOM adaptor to the jax
    //
    this.adaptor = adaptor;
    this.outputJax.setAdaptor(adaptor);
    this.inputJax.map(jax => jax.setAdaptor(adaptor));
    //
    // Pass the MmlFactory to the jax
    //
    this.mmlFactory = this.options['MmlFactory'] || new MmlFactory();
    this.inputJax.map(jax => jax.setMmlFactory(this.mmlFactory));
    //
    // Do any initialization that requires adaptors or factories
    //
    this.outputJax.initialize();
    this.inputJax.map(jax => jax.initialize());
  }

  /**
   * @return {string}  The kind of document
   */
   get kind() {
    return (this.constructor ).KIND;
  }

  /**
   * @override
   */
   addRenderAction(id, ...action) {
    const [fn, p] = RenderList.action(id, action );
    this.renderActions.add(fn, p);
  }

  /**
   * @override
   */
   removeRenderAction(id) {
    const action = this.renderActions.findID(id);
    if (action) {
      this.renderActions.remove(action);
    }
  }

  /**
   * @override
   */
   render() {
    this.renderActions.renderDoc(this);
    return this;
  }

  /**
   * @override
   */
   rerender(start = STATE.RERENDER) {
    this.state(start - 1);
    this.render();
    return this;
  }

  /**
   * @override
   */
   convert(math, options = {}) {
    let {format, display, end, ex, em, containerWidth, lineWidth, scale} = userOptions({
      format: this.inputJax[0].name, display: true, end: STATE.LAST,
      em: 16, ex: 8, containerWidth: null, lineWidth: 1000000, scale: 1
    }, options);
    if (containerWidth === null) {
      containerWidth = 80 * ex;
    }
    const jax = this.inputJax.reduce((jax, ijax) => (ijax.name === format ? ijax : jax), null);
    const mitem = new this.options.MathItem(math, jax, display);
    mitem.start.node = this.adaptor.body(this.document);
    mitem.setMetrics(em, ex, containerWidth, lineWidth, scale);
    mitem.convert(this, end);
    return (mitem.typesetRoot || mitem.root);
  }

  /**
   * @override
   */
   findMath(_options = null) {
    this.processed.set('findMath');
    return this;
  }

  /**
   * @override
   */
   compile() {
    if (!this.processed.isSet('compile')) {
      //
      //  Compile all the math in the list
      //
      const recompile = [];
      for (const math of this.math) {
        this.compileMath(math);
        if (math.inputData.recompile !== undefined) {
          recompile.push(math);
        }
      }
      //
      //  If any were added to the recompile list,
      //    compile them again
      //
      for (const math of recompile) {
        const data = math.inputData.recompile;
        math.state(data.state);
        math.inputData.recompile = data;
        this.compileMath(math);
      }
      this.processed.set('compile');
    }
    return this;
  }

  /**
   * @param {MathItem} math   The item to compile
   */
   compileMath(math) {
    try {
      math.compile(this);
    } catch (err) {
      if (err.retry || err.restart) {
        throw err;
      }
      this.options['compileError'](this, math, err);
      math.inputData['error'] = err;
    }
  }

  /**
   * Produce an error using MmlNodes
   *
   * @param {MathItem} math  The MathItem producing the error
   * @param {Error} err      The Error object for the error
   */
   compileError(math, err) {
    math.root = this.mmlFactory.create('math', null, [
      this.mmlFactory.create('merror', {'data-mjx-error': err.message, title: err.message}, [
        this.mmlFactory.create('mtext', null, [
          (this.mmlFactory.create('text') ).setText('Math input error')
        ])
      ])
    ]);
    if (math.display) {
      math.root.attributes.set('display', 'block');
    }
    math.inputData.error = err.message;
  }

  /**
   * @override
   */
   typeset() {
    if (!this.processed.isSet('typeset')) {
      for (const math of this.math) {
        try {
          math.typeset(this);
        } catch (err) {
          if (err.retry || err.restart) {
            throw err;
          }
          this.options['typesetError'](this, math, err);
          math.outputData['error'] = err;
        }
      }
      this.processed.set('typeset');
    }
    return this;
  }

  /**
   * Produce an error using HTML
   *
   * @param {MathItem} math  The MathItem producing the error
   * @param {Error} err      The Error object for the error
   */
   typesetError(math, err) {
    math.typesetRoot = this.adaptor.node('mjx-container', {
      class: 'MathJax mjx-output-error',
      jax: this.outputJax.name,
    }, [
      this.adaptor.node('span', {
        'data-mjx-error': err.message,
        title: err.message,
        style: {
          color: 'red',
          'background-color': 'yellow',
          'line-height': 'normal'
        }
      }, [
        this.adaptor.text('Math output error')
      ])
    ]);
    if (math.display) {
      this.adaptor.setAttributes(math.typesetRoot, {
        style: {
          display: 'block',
          margin: '1em 0',
          'text-align': 'center'
        }
      });
    }
    math.outputData.error = err.message;
  }

  /**
   * @override
   */
   getMetrics() {
    if (!this.processed.isSet('getMetrics')) {
      this.outputJax.getMetrics(this);
      this.processed.set('getMetrics');
    }
    return this;
  }

  /**
   * @override
   */
   updateDocument() {
    if (!this.processed.isSet('updateDocument')) {
      for (const math of this.math.reversed()) {
        math.updateDocument(this);
      }
      this.processed.set('updateDocument');
    }
    return this;
  }

  /**
   * @override
   */
   removeFromDocument(_restore = false) {
    return this;
  }

  /**
   * @override
   */
   state(state, restore = false) {
    for (const math of this.math) {
      math.state(state, restore);
    }
    if (state < STATE.INSERTED) {
      this.processed.clear('updateDocument');
    }
    if (state < STATE.TYPESET) {
      this.processed.clear('typeset');
      this.processed.clear('getMetrics');
    }
    if (state < STATE.COMPILED) {
      this.processed.clear('compile');
    }
    return this;
  }

  /**
   * @override
   */
   reset() {
    this.processed.reset();
    return this;
  }

  /**
   * @override
   */
   clear() {
    this.reset();
    this.math.clear();
    return this;
  }

  /**
   * @override
   */
   concat(list) {
    this.math.merge(list);
    return this;
  }

  /**
   * @override
   */
   clearMathItemsWithin(containers) {
    this.math.remove(...this.getMathItemsWithin(containers));
  }

  /**
   * @override
   */
   getMathItemsWithin(elements) {
    if (!Array.isArray(elements)) {
      elements = [elements];
    }
    const adaptor = this.adaptor;
    const items = [] ;
    const containers = adaptor.getElements(elements, this.document);
    ITEMS:
    for (const item of this.math) {
      for (const container of containers) {
        if (item.start.node && adaptor.contains(container, item.start.node)) {
          items.push(item);
          continue ITEMS;
        }
      }
    }
    return items;
  }

} AbstractMathDocument.__initStatic(); AbstractMathDocument.__initStatic2(); AbstractMathDocument.__initStatic3();

/**
 * The constructor type for a MathDocument
 *
 * @template D    The MathDocument type this constructor is for
 */

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */



/*****************************************************************/
/**
 *  The Handler interface
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */









































/*****************************************************************/
/**
 *  The default MathDocument class (subclasses use their own)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class DefaultMathDocument extends AbstractMathDocument {}

/*****************************************************************/
/**
 *  The Handler interface
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class AbstractHandler {

  /**
   * The name of this class
   */
   static __initStatic() {this.NAME = 'generic';}

  /**
   * The DOM Adaptor to use for managing HTML elements
   */
  

  /**
   * The priority for this handler
   */
  

  /**
   * The class implementing the MathDocument for this handler
   *   (so it can be subclassed by extensions as needed)
   */
   __init() {this.documentClass = DefaultMathDocument;}

  /**
   * @param {number} priority  The priority to use for this handler
   *
   * @constructor
   */
  constructor(adaptor, priority = 5) {AbstractHandler.prototype.__init.call(this);
    this.adaptor = adaptor;
    this.priority = priority;
  }

  /**
   * @return {string}  The name of this handler class
   */
   get name() {
    return (this.constructor ).NAME;
  }

  /**
   * @override
   */
   handlesDocument(_document) {
    return false;
  }

  /**
   * @override
   */
   create(document, options) {
    return new this.documentClass(document, this.adaptor, options) ;
  }

} AbstractHandler.__initStatic();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */



/*****************************************************************/
/**
 *  Implements the HTMLMathItem class (extends AbstractMathItem)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class HTMLMathItem extends AbstractMathItem {

  /**
   * Easy access to DOM adaptor
   */
  get adaptor() {
    return this.inputJax.adaptor;
  }

  /**
   * @override
   */
  constructor(math, jax, display = true,
              start = {node: null, n: 0, delim: ''},
              end = {node: null, n: 0, delim: ''}) {
    super(math, jax, display, start, end);
  }

  /**
   * Insert the typeset MathItem into the document at the right location
   *   If the starting and ending nodes are the same:
   *     Split the text to isolate the math and its delimiters
   *     Replace the math by the typeset version
   *   Otherewise (spread over several nodes)
   *     Split the start node, if needed
   *     Remove nodes until we reach the end node
   *     Insert the math before the end node
   *     Split the end node, if needed
   *     Remove the end node
   *
   * @override
   */
   updateDocument(_html) {
    if (this.state() < STATE.INSERTED) {
      if (this.inputJax.processStrings) {
        let node = this.start.node ;
        if (node === this.end.node) {
          if (this.end.n && this.end.n < this.adaptor.value(this.end.node).length) {
            this.adaptor.split(this.end.node, this.end.n);
          }
          if (this.start.n) {
            node = this.adaptor.split(this.start.node , this.start.n);
          }
          this.adaptor.replace(this.typesetRoot, node);
        } else {
          if (this.start.n) {
            node = this.adaptor.split(node, this.start.n);
          }
          while (node !== this.end.node) {
            let next = this.adaptor.next(node) ;
            this.adaptor.remove(node);
            node = next;
          }
          this.adaptor.insert(this.typesetRoot, node);
          if (this.end.n < this.adaptor.value(node).length) {
            this.adaptor.split(node, this.end.n);
          }
          this.adaptor.remove(node);
        }
      } else {
        this.adaptor.replace(this.typesetRoot, this.start.node);
      }
      this.start.node = this.end.node = this.typesetRoot;
      this.start.n = this.end.n = 0;
      this.state(STATE.INSERTED);
    }
  }

  /**
   * Update the style sheet for any changes due to rerendering
   *
   * @param {HTMLDocument} document   The document whose styles are to be updated
   */
   updateStyleSheet(document) {
    document.addStyleSheet();
  }

  /**
   * Remove the typeset math from the document, and put back the original
   *  expression and its delimiters, if requested.
   *
   * @override
   */
   removeFromDocument(restore = false) {
    if (this.state() >= STATE.TYPESET) {
      const adaptor = this.adaptor;
      let node = this.start.node;
      let math = adaptor.text('');
      if (restore) {
        let text = this.start.delim + this.math + this.end.delim;
        if (this.inputJax.processStrings) {
          math = adaptor.text(text);
        } else {
          const doc = adaptor.parse(text, 'text/html');
          math = adaptor.firstChild(adaptor.body(doc));
        }
      }
      if (adaptor.parent(node)) {
        adaptor.replace(math, node);
      }
      this.start.node = this.end.node = math;
      this.start.n = this.end.n = 0;
    }
  }

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 *  Implement the HTMLMathList class (extends AbstractMathList)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class HTMLMathList extends AbstractMathList {
}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/**
 *  List of consecutive text nodes and their text lengths
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 */


/*****************************************************************/
/**
 *  The HTMLDocument class (extends AbstractMathDocument)
 *
 *  A class for extracting the text from DOM trees
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class HTMLDomStrings {

  /**
   * The default options for string processing
   */
   static __initStatic() {this.OPTIONS = {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'annotation', 'annotation-xml'],
                                        // The names of the tags whose contents will not be
                                        // scanned for math delimiters

    includeHtmlTags: {br: '\n', wbr: '', '#comment': ''},
                                        //  tags to be included in the text (and what
                                        //  text to replace them with)

    ignoreHtmlClass: 'mathjax_ignore',  // the class name of elements whose contents should
                                        // NOT be processed by tex2jax.  Note that this
                                        // is a regular expression, so be sure to quote any
                                        // regexp special characters

    processHtmlClass: 'mathjax_process' // the class name of elements whose contents SHOULD
                                        // be processed when they appear inside ones that
                                        // are ignored.  Note that this is a regular expression,
                                        // so be sure to quote any regexp special characters
  };}

  /**
   * The options for this instance
   */
  

  /**
   * The array of strings found in the DOM
   */
  

  /**
   * The string currently being constructed
   */
  

  /**
   * The list of nodes and lengths for the string being constructed
   */
  

  /**
   * The list of node lists corresponding to the strings in this.strings
   */
  

  /**
   * The container nodes that are currently being traversed, and whether their
   *  contents are being ignored or not
   */
  

  /**
   * Regular expression for the tags to be skipped
   *  processing of math
   */
  
  /**
   * Regular expression for which classes should stop processing of math
   */
  
  /**
   * Regular expression for which classes should start processing of math
   */
  

  /**
   * The DOM Adaptor to managing HTML elements
   */
  

  /**
   * @param {OptionList} options  The user-supplied options
   * @constructor
   */
  constructor(options = null) {
    let CLASS = this.constructor ;
    this.options = userOptions(defaultOptions({}, CLASS.OPTIONS), options);
    this.init();
    this.getPatterns();
  }

  /**
   * Set the initial values of the main properties
   */
   init() {
    this.strings = [];
    this.string = '';
    this.snodes = [];
    this.nodes = [];
    this.stack = [];
  }

  /**
   * Create the search patterns for skipHtmlTags, ignoreHtmlClass, and processHtmlClass
   */
   getPatterns() {
    let skip = makeArray(this.options['skipHtmlTags']);
    let ignore = makeArray(this.options['ignoreHtmlClass']);
    let process = makeArray(this.options['processHtmlClass']);
    this.skipHtmlTags = new RegExp('^(?:' + skip.join('|') + ')$', 'i');
    this.ignoreHtmlClass = new RegExp('(?:^| )(?:' + ignore.join('|') + ')(?: |$)');
    this.processHtmlClass = new RegExp('(?:^| )(?:' + process + ')(?: |$)');
  }

  /**
   * Add a string to the string array and record its node list
   */
   pushString() {
    if (this.string.match(/\S/)) {
      this.strings.push(this.string);
      this.nodes.push(this.snodes);
    }
    this.string = '';
    this.snodes = [];
  }

  /**
   * Add more text to the current string, and record the
   * node and its position in the string.
   *
   * @param {N|T} node        The node to be pushed
   * @param {string} text   The text to be added (it may not be the actual text
   *                         of the node, if it is one of the nodes that gets
   *                         translated to text, like <br> to a newline).
   */
   extendString(node, text) {
    this.snodes.push([node, text.length]);
    this.string += text;
  }

  /**
   * Handle a #text node (add its text to the current string)
   *
   * @param {T} node          The Text node to process
   * @param {boolean} ignore  Whether we are currently ignoring content
   * @return {N | T}          The next element to process
   */
   handleText(node, ignore) {
    if (!ignore) {
      this.extendString(node, this.adaptor.value(node));
    }
    return this.adaptor.next(node);
  }

  /**
   * Handle a BR, WBR, or #comment element (or others in the includeHtmlTags object).
   *
   * @param {N} node          The node to process
   * @param {boolean} ignore  Whether we are currently ignoring content
   * @return {N | T}          The next element to process
   */
   handleTag(node, ignore) {
    if (!ignore) {
      let text = this.options['includeHtmlTags'][this.adaptor.kind(node)];
      this.extendString(node, text);
    }
    return this.adaptor.next(node);
  }

  /**
   * Handle an arbitrary DOM node:
   *   Check the class to see if it matches the processHtmlClass regex
   *   If the node has a child and is not marked as created by MathJax (data-MJX)
   *       and either it is marked as restarting processing or is not a tag to be skipped, then
   *     Save the next node (if there is one) and whether we are currently ignoring content
   *     Move to the first child node
   *     Update whether we are ignoring content
   *   Otherwise
   *     Move on to the next sibling
   *   Return the next node to process and the ignore state
   *
   * @param {N} node               The node to process
   * @param {boolean} ignore       Whether we are currently ignoring content
   * @return {[N|T, boolean]}      The next element to process and whether to ignore its content
   */
   handleContainer(node, ignore) {
    this.pushString();
    const cname = this.adaptor.getAttribute(node, 'class') || '';
    const tname = this.adaptor.kind(node) || '';
    const process = this.processHtmlClass.exec(cname);
    let next = node ;
    if (this.adaptor.firstChild(node) && !this.adaptor.getAttribute(node, 'data-MJX') &&
        (process || !this.skipHtmlTags.exec(tname))) {
      if (this.adaptor.next(node)) {
        this.stack.push([this.adaptor.next(node), ignore]);
      }
      next = this.adaptor.firstChild(node);
      ignore = (ignore || this.ignoreHtmlClass.exec(cname)) && !process;
    } else {
      next = this.adaptor.next(node);
    }
    return [next, ignore];
  }

  /**
   * Find the strings for a given DOM element:
   *   Initialize the state
   *   Get the element where we stop processing
   *   While we still have a node, and it is not the one where we are to stop:
   *     If it is a text node, handle it and get the next node
   *     Otherwise, if it is in the includeHtmlTags list, handle it and get the next node
   *     Otherwise, handle it as a container and get the next node and ignore status
   *     If there is no next node, and there are more nodes on the stack:
   *       Save the current string, and pop the node and ignore status from the stack
   *   Push the final string
   *   Get the string array and array of associated DOM nodes
   *   Clear the internal values (so the memory can be freed)
   *   Return the strings and node lists
   *
   * @param {N} node                       The node to search
   * @return {[string[], HTMLNodeList[]]}  The array of strings and their associated lists of nodes
   */
   find(node) {
    this.init();
    let stop = this.adaptor.next(node);
    let ignore = false;
    let include = this.options['includeHtmlTags'];

    while (node && node !== stop) {
      if (this.adaptor.kind(node) === '#text') {
        node = this.handleText(node , ignore);
      } else if (include[this.adaptor.kind(node)] !== undefined) {
        node = this.handleTag(node , ignore);
      } else {
        [node, ignore] = this.handleContainer(node , ignore);
      }
      if (!node && this.stack.length) {
        this.pushString();
        [node, ignore] = this.stack.pop();
      }
    }

    this.pushString();
    let result = [this.strings, this.nodes] ;
    this.init(); // free up memory
    return result;
  }

} HTMLDomStrings.__initStatic();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 * List of Lists of pairs consisting of a DOM node and its text length
 *
 * These represent the Text elements that make up a single
 * string in the list of strings to be searched for math
 * (multiple consecutive Text nodes can form a single string).
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 */


/*****************************************************************/
/**
 *  The HTMLDocument class (extends AbstractMathDocument)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class HTMLDocument extends AbstractMathDocument {

  /**
   * The kind of document
   */
   static __initStatic() {this.KIND = 'HTML';}

  /**
   * The default options for HTMLDocument
   */
   static __initStatic2() {this.OPTIONS = {
    ...AbstractMathDocument.OPTIONS,
    renderActions: expandable({
      ...AbstractMathDocument.OPTIONS.renderActions,
      styles: [STATE.INSERTED + 1, '', 'updateStyleSheet', false]  // update styles on a rerender() call
    }),
    MathList: HTMLMathList,           // Use the HTMLMathList for MathLists
    MathItem: HTMLMathItem,           // Use the HTMLMathItem for MathItem
    DomStrings: null                  // Use the default DomString parser
  };}

  /**
   * Extra styles to be included in the document's stylesheet (added by extensions)
   */
  

  /**
   * The DomString parser for locating the text in DOM trees
   */
  

  /**
   * @override
   * @constructor
   * @extends {AbstractMathDocument}
   */
  constructor(document, adaptor, options) {
    let [html, dom] = separateOptions(options, HTMLDomStrings.OPTIONS);
    super(document, adaptor, html);
    this.domStrings = this.options['DomStrings'] || new HTMLDomStrings(dom);
    this.domStrings.adaptor = adaptor;
    this.styles = [];
  }

  /**
   * Creates a Location object for a delimiter at the position given by index in the N's string
   *  of the array of strings searched for math, recovering the original DOM node where the delimiter
   *  was found.
   *
   * @param {number} N             The index of the string in the string array
   * @param {number} index         The position within the N's string that needs to be found
   * @param {string} delim         The delimiter for this position
   * @param {HTMLNodeArray} nodes  The list of node lists representing the string array
   * @return {Location}            The Location object for the position of the delimiter in the document
   */
   findPosition(N, index, delim, nodes) {
    const adaptor = this.adaptor;
    for (const list of nodes[N]) {
      let [node, n] = list;
      if (index <= n && adaptor.kind(node) === '#text') {
        return {node: node, n: Math.max(index, 0), delim: delim};
      }
      index -= n;
    }
    return {node: null, n: 0, delim: delim};
  }

  /**
   * Convert a ProtoItem to a MathItem (i.e., determine the actual Location
   *  objects for its start and end)
   *
   * @param {ProtoItem} item       The proto math item to turn into an actual MathItem
   * @param {InputJax} jax         The input jax to use for the MathItem
   * @param {HTMLNodeArray} nodes  The array of node lists that produced the string array
   * @return {HTMLMathItem}        The MathItem for the given proto item
   */
   mathItem(item, jax,
                     nodes) {
                       let math = item.math;
                       let start = this.findPosition(item.n, item.start.n, item.open, nodes);
                       let end = this.findPosition(item.n, item.end.n, item.close, nodes);
                       return new this.options.MathItem(math, jax, item.display, start, end) ;
                     }

  /**
   * Find math within the document:
   *  Get the list of containers (default is document.body), and for each:
   *    For each input jax:
   *      Make a new MathList to store the located math
   *      If the input jax processes strings:
   *        If we haven't already made the string array and corresponding node list, do so
   *        Ask the jax to find the math in the string array, and
   *          for each one, push it onto the math list
   *      Otherwise (the jax processes DOM nodes):
   *        Ask the jax to find the math in the container, and
   *          for each one, make the result into a MathItem, and push it on the list
   *      Merge the new math list into the document's math list
   *        (we use merge to maintain a sorted list of MathItems)
   *
   * @override
   */
   findMath(options) {
    if (!this.processed.isSet('findMath')) {
      this.adaptor.document = this.document;
      options = userOptions({elements: this.options.elements || [this.adaptor.body(this.document)]}, options);
      for (const container of this.adaptor.getElements(options['elements'], this.document)) {
        let [strings, nodes] = [null, null] ;
        for (const jax of this.inputJax) {
          let list = new (this.options['MathList'])();
          if (jax.processStrings) {
            if (strings === null) {
              [strings, nodes] = this.domStrings.find(container);
            }
            for (const math of jax.findMath(strings)) {
              list.push(this.mathItem(math, jax, nodes));
            }
          } else {
            for (const math of jax.findMath(container)) {
              let item =
                new this.options.MathItem(math.math, jax, math.display, math.start, math.end);
              list.push(item);
            }
          }
          this.math.merge(list);
        }
      }
      this.processed.set('findMath');
    }
    return this;
  }

  /**
   * @override
   */
   updateDocument() {
    if (!this.processed.isSet('updateDocument')) {
      this.addPageElements();
      this.addStyleSheet();
      super.updateDocument();
      this.processed.set('updateDocument');
    }
    return this;
  }

  /**
   *  Add any elements needed for the document
   */
   addPageElements() {
    const body = this.adaptor.body(this.document);
    const node = this.documentPageElements();
    if (node) {
      this.adaptor.append(body, node);
    }
  }

  /**
   * Add the stylesheet to the document
   */
   addStyleSheet() {
    const sheet = this.documentStyleSheet();
    if (sheet) {
      const head = this.adaptor.head(this.document);
      let styles = this.findSheet(head, this.adaptor.getAttribute(sheet, 'id'));
      if (styles) {
        this.adaptor.replace(sheet, styles);
      } else {
        this.adaptor.append(head, sheet);
      }
    }
  }

  /**
   * @param {N} head     The document <head>
   * @param {string} id  The id of the stylesheet to find
   * @param {N|null}     The stylesheet with the given ID
   */
   findSheet(head, id) {
    if (id) {
      for (const sheet of this.adaptor.tags(head, 'style')) {
        if (this.adaptor.getAttribute(sheet, 'id') === id) {
          return sheet;
        }
      }
    }
    return null ;
  }

  /**
   * @override
   */
   removeFromDocument(restore = false) {
    if (this.processed.isSet('updateDocument')) {
      for (const math of this.math) {
        if (math.state() >= STATE.INSERTED) {
          math.state(STATE.TYPESET, restore);
        }
      }
    }
    this.processed.clear('updateDocument');
    return this;
  }

  /**
   * @override
   */
   documentStyleSheet() {
    return this.outputJax.styleSheet(this);
  }

  /**
   * @override
   */
   documentPageElements() {
    return this.outputJax.pageElements(this);
  }

  /**
   * Add styles to be included in the document's stylesheet
   *
   * @param {StyleList} styles   The styles to include
   */
   addStyles(styles) {
    this.styles.push(styles);
  }

  /**
   * Get the array of document-specific styles
   */
   getStyles() {
    return this.styles;
  }

} HTMLDocument.__initStatic(); HTMLDocument.__initStatic2();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 *  Implements the HTMLHandler class (extends AbstractHandler)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class HTMLHandler extends AbstractHandler {constructor(...args) { super(...args); HTMLHandler.prototype.__init.call(this); }

  /**
   * The DOMAdaptor for the document being handled
   */
    // declare a more specific adaptor type

  /**
   * @override
   */
   __init() {this.documentClass = HTMLDocument;}

  /**
   * @override
   */
   handlesDocument(document) {
    const adaptor = this.adaptor;
    if (typeof(document) === 'string') {
      try {
        document = adaptor.parse(document, 'text/html');
      } catch (err) {}
    }
    if (document instanceof adaptor.window.Document ||
        document instanceof adaptor.window.HTMLElement ||
        document instanceof adaptor.window.DocumentFragment) {
      return true;
    }
    return false;
  }

  /**
   * If the document isn't already a Document object, create one
   * using the given data
   *
   * @override
   */
   create(document, options) {
    const adaptor = this.adaptor;
    if (typeof(document) === 'string') {
      document = adaptor.parse(document, 'text/html');
    } else if (document instanceof adaptor.window.HTMLElement ||
               document instanceof adaptor.window.DocumentFragment) {
      let child = document ;
      document = adaptor.parse('', 'text/html');
      adaptor.append(adaptor.body(document), child);
    }
    return super.create(document, options) ;
  }

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/**
 * Create the HTML handler object and register it with MathJax.
 *
 * @param {DOMAdaptor<N,T,D>} adaptor  The DOM adaptor to use with HTML
 * @return {HTMLHandler}               The newly created handler
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
function RegisterHTMLHandler(adaptor) {
  const handler = new HTMLHandler(adaptor);
  mathjax.handlers.register(handler);
  return handler;
}

/**
 * The data for an attribute
 */







































































































































































































































































































































/*****************************************************************/
/**
 *  Abstract DOMAdaptor class for creating HTML elements
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class AbstractDOMAdaptor {

  /**
   * The document in which the HTML nodes will be created
   */
  

  /**
   * @param {D} document  The document in which the nodes will be created
   * @constructor
   */
  constructor(document = null) {
    this.document = document;
  }

  /**
   * @override
   */
  

  /**
   * @override
   */
   node(kind, def = {}, children = [], ns) {
    const node = this.create(kind, ns);
    this.setAttributes(node, def);
    for (const child of children) {
      this.append(node, child);
    }
    return node ;
  }

  /**
   * @param {string} kind  The type of the node to create
   * @param {string} ns    The optional namespace in which to create the node
   * @return {N}           The created node
   */
  






  /**
   * @param {N} node           The HTML element whose attributes are to be set
   * @param {OptionList} def   The attributes to set on that node
   */
   setAttributes(node, def) {
    if (def.style && typeof(def.style) !== 'string') {
      for (let key of Object.keys(def.style)) {
        this.setStyle(node, key.replace(/-([a-z])/g, (_m, c) => c.toUpperCase()), def.style[key]);
      }
    }
    if (def.properties) {
      for (let key of Object.keys(def.properties)) {
        (node )[key] = def.properties[key];
      }
    }
    for (let key of Object.keys(def)) {
      if ((key !== 'style' || typeof(def.style) === 'string') && key !== 'properties') {
        this.setAttribute(node, key, def[key]);
      }
    }
  }

  /**
   * @override
   */
  



















































  /**
   * @override
   */
   replace(nnode, onode) {
    this.insert(nnode, onode);
    this.remove(onode);
    return onode;
  }

  /**
   * @override
   */
  































  /**
   * @override
   */
   childNode(node, i) {
    return this.childNodes(node)[i];
  }

  /**
   * @override
   */
  






























































  /**
   * @override
   */
   allClasses(node) {
    const classes = this.getAttribute(node, 'class');
    return (!classes ? []  :
            classes.replace(/  +/g, ' ').replace(/^ /, '').replace(/ $/, '').split(/ /));
  }

  /**
   * @override
   */
  































}

/*****************************************************************/
/**
 * The minimum fields needed for a Document
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 */























































































































/*****************************************************************/
/**
 *  Abstract HTMLAdaptor class for manipulating HTML elements
 *  (subclass of AbstractDOMAdaptor)
 *
 *  N = HTMLElement node class
 *  T = Text node class
 *  D = Document class
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class HTMLAdaptor extends
AbstractDOMAdaptor {
  /**
   * The window object for this adaptor
   */
  

  /**
   * The DOMParser used to parse a string into a DOM tree
   */
  

  /**
   * @override
   * @constructor
   */
  constructor(window) {
    super(window.document);
    this.window = window;
    this.parser = new (window.DOMParser )();
  }

  /**
   * @override
   */
   parse(text, format = 'text/html') {
    return this.parser.parseFromString(text, format);
  }

  /**
   * @override
   */
   create(kind, ns) {
    return (ns ?
            this.document.createElementNS(ns, kind) :
            this.document.createElement(kind));
  }

  /**
   * @override
   */
   text(text) {
    return this.document.createTextNode(text);
  }

  /**
   * @override
   */
   head(doc) {
    return doc.head;
  }

  /**
   * @override
   */
   body(doc) {
    return doc.body;
  }

  /**
   * @override
   */
   root(doc) {
    return doc.documentElement;
  }

  /**
   * @override
   */
   doctype(doc) {
    return `<!DOCTYPE ${doc.doctype.name}>`;
  }

  /**
   * @override
   */
   tags(node, name, ns = null) {
    let nodes = (ns ? node.getElementsByTagNameNS(ns, name) : node.getElementsByTagName(name));
    return Array.from(nodes ) ;
  }

  /**
   * @override
   */
   getElements(nodes, _document) {
    let containers = [];
    for (const node of nodes) {
      if (typeof(node) === 'string') {
        containers = containers.concat(Array.from(this.document.querySelectorAll(node)));
      } else if (Array.isArray(node)) {
        containers = containers.concat(Array.from(node) );
      } else if (node instanceof this.window.NodeList || node instanceof this.window.HTMLCollection) {
        containers = containers.concat(Array.from(node ));
      } else {
        containers.push(node);
      }
    }
    return containers;
  }

  /**
   * @override
   */
   contains(container, node) {
    return container.contains(node);
  }

  /**
   * @override
   */
   parent(node) {
    return node.parentNode ;
  }

  /**
   * @override
   */
   append(node, child) {
    return node.appendChild(child) ;
  }

  /**
   * @override
   */
   insert(nchild, ochild) {
    return this.parent(ochild).insertBefore(nchild, ochild);
  }

  /**
   * @override
   */
   remove(child) {
    return this.parent(child).removeChild(child) ;
  }

  /**
   * @override
   */
   replace(nnode, onode) {
    return this.parent(onode).replaceChild(nnode, onode) ;
  }

  /**
   * @override
   */
   clone(node) {
    return node.cloneNode(true) ;
  }

  /**
   * @override
   */
   split(node, n) {
    return node.splitText(n);
  }

  /**
   * @override
   */
   next(node) {
    return node.nextSibling ;
  }

  /**
   * @override
   */
   previous(node) {
    return node.previousSibling ;
  }

  /**
   * @override
   */
   firstChild(node) {
    return node.firstChild ;
  }

  /**
   * @override
   */
   lastChild(node) {
    return node.lastChild ;
  }

  /**
   * @override
   */
   childNodes(node) {
    return Array.from(node.childNodes );
  }

  /**
   * @override
   */
   childNode(node, i) {
    return node.childNodes[i] ;
  }

  /**
   * @override
   */
   kind(node) {
    return node.nodeName.toLowerCase();
  }

  /**
   * @override
   */
   value(node) {
    return node.nodeValue || '';
  }

  /**
   * @override
   */
   textContent(node) {
    return node.textContent;
  }

  /**
   * @override
   */
   innerHTML(node) {
    return node.innerHTML;
  }

  /**
   * @override
   */
   outerHTML(node) {
    return node.outerHTML;
  }

  /**
   * @override
   */
   setAttribute(node, name, value, ns = null) {
    if (!ns) {
      return node.setAttribute(name, value);
    }
    name = ns.replace(/.*\//, '') + ':' + name.replace(/^.*:/, '');
    return node.setAttributeNS(ns, name, value);
  }

  /**
   * @override
   */
   getAttribute(node, name) {
    return node.getAttribute(name);
  }

  /**
   * @override
   */
   removeAttribute(node, name) {
    return node.removeAttribute(name);
  }

  /**
   * @override
   */
   hasAttribute(node, name) {
    return node.hasAttribute(name);
  }

  /**
   * @override
   */
   allAttributes(node) {
    return Array.from(node.attributes).map(
      (x) => {
        return {name: x.name, value: x.value} ;
      }
    );
  }

  /**
   * @override
   */
   addClass(node, name) {
    if (node.classList) {
      node.classList.add(name);
    } else {
      node.className = (node.className + ' ' + name).trim();
    }
  }

  /**
   * @override
   */
   removeClass(node, name) {
    if (node.classList) {
      node.classList.remove(name);
    } else {
      node.className = node.className.split(/ /).filter((c) => c !== name).join(' ');
    }
  }

  /**
   * @override
   */
   hasClass(node, name) {
    if (node.classList) {
      return node.classList.contains(name);
    }
    return node.className.split(/ /).indexOf(name) >= 0;
  }

  /**
   * @override
   */
   setStyle(node, name, value) {
    (node.style )[name] = value;
  }

  /**
   * @override
   */
   getStyle(node, name) {
    return (node.style )[name];
  }

  /**
   * @override
   */
   allStyles(node) {
    return node.style.cssText;
  }

  /**
   * @override
   */
   fontSize(node) {
    const style = this.window.getComputedStyle(node);
    return parseFloat(style.fontSize);
  }

  /**
   * @override
   */
   fontFamily(node) {
    const style = this.window.getComputedStyle(node);
    return style.fontFamily || '';
  }

  /**
   * @override
   */
   nodeSize(node, em = 1, local = false) {
    if (local && node.getBBox) {
      let {width, height} = node.getBBox();
      return [width / em , height / em] ;
    }
    return [node.offsetWidth / em, node.offsetHeight / em] ;
  }

  /**
   * @override
   */
   nodeBBox(node) {
    const {left, right, top, bottom} = node.getBoundingClientRect() ;
    return {left, right, top, bottom};
  }
}

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

//
//  Let Typescript know about these
//











/**
 * Function to create an HTML adpator for browsers
 *
 * @return {HTMLAdaptor}  The newly created adaptor
 */
function browserAdaptor() {
  return new HTMLAdaptor(window);
}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Utility functions for handling dimensions (lengths)
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

/**
 *  A very large number
 */
const BIGDIMEN = 1000000;

/**
 *  Sizes of various units in pixels
 */
const UNITS = {
  px: 1,
  'in': 96,            // 96 px to an inch
  cm: 96 / 2.54,       // 2.54 cm to an inch
  mm: 96 / 25.4        // 10 mm to a cm
};

/**
 *  Sizes of various relative units in em's
 */
const RELUNITS = {
  em: 1,
  ex: .431,        // this.TEX.x_height;
  pt: 1 / 10,      // 10 pt to an em
  pc: 12 / 10,     // 12 pc to a pt
  mu: 1 / 18       // 18mu to an em for the scriptlevel
};

/**
 *  The various named spaces
 */
const MATHSPACE = {
  /* tslint:disable:whitespace */
  veryverythinmathspace:           1/18,
  verythinmathspace:               2/18,
  thinmathspace:                   3/18,
  mediummathspace:                 4/18,
  thickmathspace:                  5/18,
  verythickmathspace:              6/18,
  veryverythickmathspace:          7/18,
  negativeveryverythinmathspace:  -1/18,
  negativeverythinmathspace:      -2/18,
  negativethinmathspace:          -3/18,
  negativemediummathspace:        -4/18,
  negativethickmathspace:         -5/18,
  negativeverythickmathspace:     -6/18,
  negativeveryverythickmathspace: -7/18,
  /* tslint:enable */

  thin:   .04,
  medium: .06,
  thick:  .1,

  normal:  1,
  big:     2,
  small:   1 / Math.sqrt(2),

  infinity:  BIGDIMEN
};


/**
 * @param {string|number} length  A dimension (giving number and units) to be converted to ems
 * @param {number} size           The default size of the dimension (for percentage values)
 * @param {number} scale          The current scaling factor (to handle absolute units)
 * @param {number} em             The size of an em in pixels
 * @return {number}               The dimension converted to ems
 */
function length2em(length, size = 0, scale = 1, em = 16) {
  if (typeof length !== 'string') {
    length = String(length);
  }
  if (length === '' || length == null) {
    return size;
  }
  if (MATHSPACE[length]) {
    return MATHSPACE[length];
  }
  let match = length.match(/^\s*([-+]?(?:\.\d+|\d+(?:\.\d*)?))?(pt|em|ex|mu|px|pc|in|mm|cm|%)?/);
  if (!match) {
    return size;
  }
  let m = parseFloat(match[1] || '1'), unit = match[2];
  if (UNITS.hasOwnProperty(unit)) {
    return m * UNITS[unit] / em / scale;
  }
  if (RELUNITS.hasOwnProperty(unit)) {
    return m * RELUNITS[unit];
  }
  if (unit === '%') {
    return m / 100 * size;  // percentage of the size
  }
  return m * size;            // relative to size
}

/**
 * @param {number} m  A number to be shown as a percent
 * @return {string}   The number m as a percent
 */
function percent(m) {
  return (100 * m).toFixed(1).replace(/\.?0+$/, '') + '%';
}

/**
 * @param {number} m  A number to be shown in ems
 * @return {string}   The number with units of ems
 */
function em(m) {
  if (Math.abs(m) < .001) return '0';
  return (m.toFixed(3).replace(/\.?0+$/, '')) + 'em';
}


/**
 * @param {number} m   A number of em's to be shown as pixels
 * @param {number} M   The minimum number of pixels to allow
 * @param {number} em  The number of pixels in an em
 * @return {string}    The number with units of px
 */
function px(m, M = -BIGDIMEN, em = 16) {
  m *= em;
  if (M && m < M) m = M;
  if (Math.abs(m) < .1) return '0';
  return m.toFixed(1).replace(/\.0$/, '') + 'px';
}

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements a lite CssStyleDeclaration replacement
 *                (very limited in scope)
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

/**
 * An object contining name: value pairs
 */
















/*********************************************************/
/**
 * Some common children arrays
 */
const TRBL = ['top', 'right', 'bottom', 'left'];
const WSC = ['width', 'style', 'color'];

/**
 * Split a style at spaces (taking quotation marks and commas into account)
 *
 * @param {string} text  The combined styles to be split at spaces
 * @return {string[]}    Array of parts of the style (separated by spaces)
 */
function splitSpaces(text) {
  const parts = text.split(/((?:'[^']*'|"[^"]*"|,[\s\n]|[^\s\n])*)/g);
  const split = [] ;
  while (parts.length > 1) {
    parts.shift();
    split.push(parts.shift());
  }
  return split;
}

/*********************************************************/
/**
 * Split a top-right-bottom-left group into its parts
 * Format:
 *    x           all are the same value
 *    x y         same as x y x y
 *    x y z       same as x y z y
 *    x y z w     each specified
 *
 * @param {string} name   The style to be processed
 */

function splitTRBL(name) {
  const parts = splitSpaces(this.styles[name]);
  if (parts.length === 0) {
    parts.push('');
  }
  if (parts.length === 1) {
    parts.push(parts[0]);
  }
  if (parts.length === 2) {
    parts.push(parts[0]);
  }
  if (parts.length === 3) {
    parts.push(parts[1]);
  }
  for (const child of Styles.connect[name].children) {
    this.setStyle(this.childName(name, child), parts.shift());
  }
}

/**
 * Combine top-right-bottom-left into one entry
 * (removing unneeded values)
 *
 * @param {string} name   The style to be processed
 */
function combineTRBL(name) {
  const children = Styles.connect[name].children;
  const parts = [] ;
  for (const child of children) {
    const part = this.styles[name + '-' + child];
    if (!part) {
      delete this.styles[name];
      return;
    }
    parts.push(part);
  }
  if (parts[3] === parts[1]) {
    parts.pop();
    if (parts[2] === parts[0]) {
      parts.pop();
      if (parts[1] === parts[0]) {
        parts.pop();
      }
    }
  }
  this.styles[name] = parts.join(' ');
}

/*********************************************************/
/**
 * Use the same value for all children
 *
 * @param {string} name   The style to be processed
 */
function splitSame(name) {
  for (const child of Styles.connect[name].children) {
    this.setStyle(this.childName(name, child), this.styles[name]);
  }
}

/**
 * Check that all children have the same values and
 * if so, set the parent to that value
 *
 * @param {string} name   The style to be processed
 */
function combineSame(name) {
  const children = [...Styles.connect[name].children];
  const value = this.styles[this.childName(name, children.shift())];
  for (const child of children) {
    if (this.styles[this.childName(name, child)] !== value) {
      delete this.styles[name];
      return;
    }
  }
  this.styles[name] = value;
}

/*********************************************************/
/**
 * Patterns for the parts of a boarder
 */
const BORDER = {
  width: /^(?:[\d.]+(?:[a-z]+)|thin|medium|thick|inherit|initial|unset)$/,
  style: /^(?:none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset|inherit|initial|unset)$/
};

/**
 * Split a width-style-color border definition
 *
 * @param {string} name   The style to be processed
 */
function splitWSC(name) {
  let parts = {width: '', style: '', color: ''} ;
  for (const part of splitSpaces(this.styles[name])) {
    if (part.match(BORDER.width) && parts.width === '') {
      parts.width = part;
    } else if (part.match(BORDER.style) && parts.style === '') {
      parts.style = part;
    } else {
      parts.color = part;
    }
  }
  for (const child of Styles.connect[name].children) {
    this.setStyle(this.childName(name, child), parts[child]);
  }
}

/**
 * Combine with-style-color border definition from children
 *
 * @param {string} name   The style to be processed
 */
function combineWSC(name) {
  const parts = [] ;
  for (const child of Styles.connect[name].children) {
    const value = this.styles[this.childName(name, child)];
    if (value) {
      parts.push(value);
    }
  }
  if (parts.length) {
    this.styles[name] = parts.join(' ');
  } else {
    delete this.styles[name];
  }
}

/*********************************************************/
/**
 * Patterns for the parts of a font declaration
 */
const FONT = {
  style: /^(?:normal|italic|oblique|inherit|initial|unset)$/,
  variant: new RegExp('^(?:' +
                      ['normal|none',
                       'inherit|initial|unset',
                       'common-ligatures|no-common-ligatures',
                       'discretionary-ligatures|no-discretionary-ligatures',
                       'historical-ligatures|no-historical-ligatures',
                       'contextual|no-contextual',
                       '(?:stylistic|character-variant|swash|ornaments|annotation)\\([^)]*\\)',
                       'small-caps|all-small-caps|petite-caps|all-petite-caps|unicase|titling-caps',
                       'lining-nums|oldstyle-nums|proportional-nums|tabular-nums',
                       'diagonal-fractions|stacked-fractions',
                       'ordinal|slashed-zero',
                       'jis78|jis83|jis90|jis04|simplified|traditional',
                       'full-width|proportional-width',
                       'ruby'].join('|') + ')$'),
  weight: /^(?:normal|bold|bolder|lighter|[1-9]00|inherit|initial|unset)$/,
  stretch: new RegExp('^(?:' +
                      ['normal',
                       '(?:(?:ultra|extra|semi)-)?condensed',
                       '(?:(?:semi|extra|ulta)-)?expanded',
                       'inherit|initial|unset']. join('|') + ')$'),
  size: new RegExp('^(?:' +
                   ['xx-small|x-small|small|medium|large|x-large|xx-large|larger|smaller',
                    '[\d.]+%|[\d.]+[a-z]+',
                    'inherit|initial|unset'].join('|') + ')' +
                   '(?:\/(?:normal|[\d.\+](?:%|[a-z]+)?))?$')
};

/**
 * Split a font declaration into is parts (not perfect but good enough for now)
 *
 * @param {string} name   The style to be processed
 */
function splitFont(name) {
  const parts = splitSpaces(this.styles[name]);
  //
  //  The parts found (array means can be more than one word)
  //
  const value = {
    style: '', variant: [], weight: '', stretch: '',
    size: '', family: '', 'line-height': ''
  } ;
  for (const part of parts) {
    value.family = part; // assume it is family unless otherwise (family must be present)
    for (const name of Object.keys(FONT)) {
      if ((Array.isArray(value[name]) || value[name] === '') && part.match(FONT[name])) {
        if (name === 'size') {
          //
          // Handle size/line-height
          //
          const [size, height] = part.split(/\//);
          value[name] = size;
          if (height) {
            value['line-height'] = height;
          }
        } else if (value.size === '') {
          //
          // style, weight, variant, stretch must appear before size
          //
          if (Array.isArray(value[name])) {
            (value[name] ).push(part);
          } else {
            value[name] = part;
          }
        }
      }
    }
  }
  saveFontParts(name, value);
  delete this.styles[name]; // only use the parts, not the font declaration itself
}

/**
 * @param {string} name   The style to be processed
 * @param {{[name: string]: string | string[]}} value  The list of parts detected above
 */
function saveFontParts(name, value) {
  for (const child of Styles.connect[name].children) {
    const cname = this.childName(name, child);
    if (Array.isArray(value[child])) {
      const values = value[child] ;
      if (values.length) {
        this.styles[cname] = values.join(' ');
      }
    } else  if (value[child] !== '') {
      this.styles[cname] = value[child];
    }
  }
}

/**
 * Combine font parts into one (we don't actually do that)
 */
function combineFont(_name) {}

/*********************************************************/
/**
 * Implements the Styles object (lite version of CssStyleDeclaration)
 */
class Styles {

  /**
   * Patterns for style values and comments
   */
   static __initStatic() {this.pattern = {
    style: /([-a-z]+)[\s\n]*:[\s\n]*((?:'[^']*'|"[^"]*"|\n|.)*?)[\s\n]*(?:;|$)/g,
    comment: /\/\*[^]*?\*\//g
  };}

  /**
   * The mapping of parents to children, and how to split and combine them
   */
   static __initStatic2() {this.connect = {
    padding: {
      children: TRBL,
      split: splitTRBL,
      combine: combineTRBL
    },

    border: {
      children: TRBL,
      split: splitSame,
      combine: combineSame
    },
    'border-top': {
      children: WSC,
      split: splitWSC,
      combine: combineWSC
    },
    'border-right': {
      children: WSC,
      split: splitWSC,
      combine: combineWSC
    },
    'border-bottom': {
      children: WSC,
      split: splitWSC,
      combine: combineWSC
    },
    'border-left': {
      children: WSC,
      split: splitWSC,
      combine: combineWSC
    },
    'border-width': {
      children: TRBL,
      split: splitTRBL,
      combine: null      // means its children combine to a different parent
    },
    'border-style': {
      children: TRBL,
      split: splitTRBL,
      combine: null      // means its children combine to a different parent
    },
    'border-color': {
      children: TRBL,
      split: splitTRBL,
      combine: null      // means its children combine to a different parent
    },

    font: {
      children: ['style', 'variant', 'weight', 'stretch', 'line-height', 'size', 'family'],
      split: splitFont,
      combine: combineFont
    }
  };}

  /**
   * The list of styles defined for this declaration
   */
  

  /**
   * @param {string} cssText  The initial definition for the style
   * @constructor
   */
  constructor(cssText = '') {
    this.parse(cssText);
  }

  /**
   * @return {string}  The CSS string for the styles currently defined
   */
   get cssText() {
    const styles = [] ;
    for (const name of Object.keys(this.styles)) {
      const parent = this.parentName(name);
      if (!this.styles[parent]) {
        styles.push(name + ': ' + this.styles[name]);
      }
    }
    return styles.join('; ');
  }

  /**
   * @param {string} name   The name of the style to set
   * @param {srting|number|boolean} value The value to set it to
   */
   set(name, value) {
    name = this.normalizeName(name);
    this.setStyle(name, value );
    //
    // If there is no combine function ,the children combine to
    // a separate parent (e.g., border-width sets border-top-width, etc.
    // and combines to border-top)
    //
    if (Styles.connect[name] && !Styles.connect[name].combine) {
      this.combineChildren(name);
      delete this.styles[name];
    }
    //
    // If we just changed a child, we need to try to combine
    // it with its parent's other children
    //
    while (name.match(/-/)) {
      name = this.parentName(name);
      if (!Styles.connect[name]) break;
      Styles.connect[name].combine.call(this, name);
    }
  }

  /**
   * @param {string} name  The name of the style to get
   * @return {string}      The value of the style (or empty string if not defined)
   */
   get(name) {
    name = this.normalizeName(name);
    return (this.styles.hasOwnProperty(name) ? this.styles[name] : '');
  }

  /**
   * @param {string} name   The name of the style to set (without causing parent updates)
   * @param {string} value  The value to set it to
   */
   setStyle(name, value) {
    this.styles[name] = value;
    if (Styles.connect[name] && Styles.connect[name].children) {
      Styles.connect[name].split.call(this, name);
    }
    if (value === '') {
      delete this.styles[name];
    }
  }

  /**
   * @param {string} name   The name of the style whose parent is to be combined
   */
   combineChildren(name) {
    const parent = this.parentName(name);
    for (const child of Styles.connect[name].children) {
      const cname = this.childName(parent, child);
      Styles.connect[cname].combine.call(this, cname);
    }
  }

  /**
   * @param {string} name   The name of the style whose parent style is to be found
   * @return {string}       The name of the parent, or '' if none
   */
   parentName(name) {
    const parent = name.replace(/-[^-]*$/, '');
    return (name === parent ? '' : parent);
  }

  /**
   * @param {string} name   The name of the parent style
   * @param {string} child  The suffix to be added to the parent
   * @preturn {string}      The combined name
   */
   childName(name, child) {
    //
    // If the child contains a dash, it is already the fill name
    //
    if (child.match(/-/)) {
      return child;
    }
    //
    // For non-combining styles, like border-width, insert
    //   the child name before the find word, e.g., border-top-width
    //
    if (Styles.connect[name] && !Styles.connect[name].combine) {
      child += name.replace(/.*-/, '-');
      name = this.parentName(name);
    }
    return name + '-' + child;
  }

  /**
   * @param {string} name  The name of a style to normalize
   * @return {string}      The name converted from CamelCase to lowercase with dashes
   */
   normalizeName(name) {
    return name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
  }

  /**
   * @param {string} cssText  A style text string to be parsed into separate styles
   *                          (by using this.set(), we get all the sub-styles created
   *                           as well as the merged style shorthands)
   */
   parse(cssText = '') {
    let PATTERN = (this.constructor ).pattern;
    this.styles = {};
    const parts = cssText.replace(PATTERN.comment, '').split(PATTERN.style);
    while (parts.length > 1) {
      let [space, name, value] = parts.splice(0, 3);
      if (space.match(/[^\s\n]/)) return;
      this.set(name, value);
    }
  }

} Styles.__initStatic(); Styles.__initStatic2();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements the CssStyles class for handling stylesheets
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

/**
 * The data for a selector
 */











/******************************************************************************/
/**
 * The CssStyles class (for managing a collection of CSS style definitions)
 */

class CssStyles {
  /**
   * The styles as they currently stand
   */
   __init() {this.styles = {};}

  /**
   * @return {string}  The styles as a CSS string
   */
  get cssText() {
    return this.getStyleString();
  }

  /**
   * @param {StyleList} styles  The initial styles to use, if any
   * @constructor
   */
  constructor(styles = null) {CssStyles.prototype.__init.call(this);
    this.addStyles(styles);
  }

  /**
   * @param {StyleList} styles  The styles to combine with the existing ones
   */
   addStyles(styles) {
    if (!styles) return;
    for (const style of Object.keys(styles)) {
      if (!this.styles[style]) {
        this.styles[style] = {};
      }
      Object.assign(this.styles[style], styles[style]);
    }
  }

  /**
   * @param {string[]} selectors  The selectors for the styles to remove
   */
   removeStyles(...selectors) {
    for (const selector of selectors) {
      delete this.styles[selector];
    }
  }

  /**
   * Clear all the styles
   */
   clear() {
    this.styles = {};
  }

  /**
   * @return {string} The CSS string for the style list
   */
   getStyleString() {
    const selectors = Object.keys(this.styles);
    const defs = new Array(selectors.length);
    let i = 0;
    for (const selector of selectors) {
      defs[i++] = selector + ' {\n' + this.getStyleDefString(this.styles[selector]) + '\n}';
    }
    return defs.join('\n\n');
  }

  /**
   * @param {StyleData} styles  The style data to be stringified
   * @return {string}           The CSS string for the given data
   */
   getStyleDefString(styles) {
    const properties = Object.keys(styles);
    const values = new Array(properties.length);
    let i = 0;
    for (const property of properties) {
      values[i++] = '  ' + property + ': ' + styles[property] + ';';
    }
    return values.join('\n');
  }

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/



















/*****************************************************************/

/**
 *  The CommonOutputJax class on which the CHTML and SVG jax are built
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 * @template W  The Wrapper class
 * @template F  The WrapperFactory class
 * @template FD The FontData class
 * @template FC The FontDataClass object
 */
class CommonOutputJax





 extends AbstractOutputJax {

  /**
   * The name of this output jax
   */
   static __initStatic() {this.NAME = 'Common';}

  /**
   * @override
   */
   static __initStatic2() {this.OPTIONS = {
      ...AbstractOutputJax.OPTIONS,
    scale: 1,                      // global scaling factor for all expressions
    minScale: .5,                  // smallest scaling factor to use
    matchFontHeight: true,         // true to match ex-height of surrounding font
    mtextInheritFont: false,       // true to make mtext elements use surrounding font
    merrorInheritFont: false,      // true to make merror text use surrounding font
    mtextFont: '',                 // font to use for mtext, if not inheriting (empty means use MathJax fonts)
    merrorFont: 'serif',           // font to use for merror, if not inheriting (empty means use MathJax fonts)
    mathmlSpacing: false,          // true for MathML spacing rules, false for TeX rules
    skipAttributes: {},            // RFDa and other attributes NOT to copy to the output
    exFactor: .5,                  // default size of ex in em units
    displayAlign: 'center',        // default for indentalign when set to 'auto'
    displayIndent: '0',            // default for indentshift when set to 'auto'
    wrapperFactory: null,          // The wrapper factory to use
    font: null,                    // The FontData object to use
    cssStyles: null                // The CssStyles object to use
  };}

  /**
   *  The default styles for the output jax
   */
   static __initStatic3() {this.commonStyles = {};}

  /**
   * Used for collecting styles needed for the output jax
   */
  

  /**
   * The MathDocument for the math we find
   */
  

  /**
   * the MathItem currently being processed
   */
  

  /**
   * The container element for the math
   */
  

  /**
   * The top-level table, if any
   */
  

  /**
   * The pixels per em for the math item being processed
   */
  

  /**
   * The data for the font in use
   */
  

  /**
   * The wrapper factory for the MathML nodes
   */
  

  /**
   * A map from the nodes in the expression currently being processed to the
   * wrapper nodes for them (used by functions like core() to locate the wrappers
   * from the core nodes)
   */
  

  /**
   * Node used to test for in-line metric data
   */
  

  /**
   * Node used to test for display metric data
   */
  

  /**
   * Cache of unknonw character bounding boxes for this element
   */
  

  /*****************************************************************/

  /**
   * Get the WrapperFactory and connect it to this output jax
   * Get the cssStyle and font objects
   *
   * @param {OptionList} options         The configuration options
   * @param {CommonWrapperFactory} defaultFactory  The default wrapper factory class
   * @param {FC} defaultFont  The default FontData constructor
   * @constructor
   */
  constructor(options = null,
              defaultFactory = null,
              defaultFont = null) {
    const [jaxOptions, fontOptions] = separateOptions(options, defaultFont.OPTIONS);
    super(jaxOptions);
    this.factory = this.options.wrapperFactory ||
      new defaultFactory
();
    this.factory.jax = this;
    this.cssStyles = this.options.cssStyles || new CssStyles();
    this.font = this.options.font || new defaultFont(fontOptions);
    this.unknownCache = new Map();
  }

  /*****************************************************************/

  /**
   * Save the math document
   * Create the mjx-container node
   * Create the DOM output for the root MathML math node in the container
   * Return the container node
   *
   * @override
   */
   typeset(math, html) {
    this.setDocument(html);
    let node = this.createNode();
    this.toDOM(math, node, html);
    return node;
  }

  /**
   * @return {N}  The container DOM node for the typeset math
   */
   createNode() {
    const jax = (this.constructor ).NAME;
    return this.html('mjx-container', {'class': 'MathJax', jax: jax});
  }

  /**
   * @param {N} node   The container whose scale is to be set
   */
   setScale(node) {
    const scale = this.math.metrics.scale * this.options.scale;
    if (scale !== 1) {
      this.adaptor.setStyle(node, 'fontSize', percent(scale));
    }
  }

  /**
   * Save the math document, if any, and the math item
   * Set the document where HTML nodes will be created via the adaptor
   * Recursively set the TeX classes for the nodes
   * Set the scaling for the DOM node
   * Create the nodeMap (maps MathML nodes to corresponding wrappers)
   * Create the HTML output for the root MathML node in the container
   * Clear the nodeMape
   * Execute the post-filters
   *
   * @param {MathItem} math      The math item to convert
   * @param {N} node             The contaier to place the result into
   * @param {MathDocument} html  The document containing the math
   */
   toDOM(math, node, html = null) {
    this.setDocument(html);
    this.math = math;
    this.pxPerEm = math.metrics.ex / this.font.params.x_height;
    math.root.setTeXclass(null);
    this.setScale(node);
    this.nodeMap = new Map();
    this.container = node;
    this.processMath(math.root, node);
    this.nodeMap = null;
    this.executeFilters(this.postFilters, math, html, node);
  }

  /**
   * This is the actual typesetting function supplied by the subclass
   *
   * @param {MmlNode} math   The intenral MathML node of the root math element to process
   * @param {N} node         The container node where the math is to be typeset
   */
  

  /*****************************************************************/

  /**
   * @param {MathItem} math      The MathItem to get the bounding box for
   * @param {MathDocument} html  The MathDocument for the math
   */
   getBBox(math, html) {
    this.setDocument(html);
    this.math = math;
    math.root.setTeXclass(null);
    this.nodeMap = new Map();
    let bbox = this.factory.wrap(math.root).getBBox();
    this.nodeMap = null;
    return bbox;
  }

  /*****************************************************************/

  /**
   * @override
   */
   getMetrics(html) {
    this.setDocument(html);
    const adaptor = this.adaptor;
    const maps = this.getMetricMaps(html);
    for (const math of html.math) {
      const parent = adaptor.parent(math.start.node);
      if (math.state() < STATE.METRICS && parent) {
        const map = maps[math.display ? 1 : 0];
        const {em, ex, containerWidth, lineWidth, scale, family} = map.get(parent);
        math.setMetrics(em, ex, containerWidth, lineWidth, scale);
        if (this.options.mtextInheritFont) {
          math.outputData.mtextFamily = family;
        }
        if (this.options.merrorInheritFont) {
          math.outputData.merrorFamily = family;
        }
        math.state(STATE.METRICS);
      }
    }
  }

  /**
   * @param {N} node            The container node whose metrics are to be measured
   * @param {boolean} display   True if the metrics are for displayed math
   * @return {Metrics}          Object containing em, ex, containerWidth, etc.
   */
   getMetricsFor(node, display) {
    const getFamily = (this.options.mtextInheritFont || this.options.merrorInheritFont);
    const test = this.getTestElement(node, display);
    const metrics = this.measureMetrics(test, getFamily);
    this.adaptor.remove(test);
    return metrics;
  }

  /**
   * Get a MetricMap for the math list
   *
   * @param {MathDocument} html  The math document whose math list is to be processed.
   * @return {MetricMap[]}       The node-to-metrics maps for all the containers that have math
   */
   getMetricMaps(html) {
    const adaptor = this.adaptor;
    const domMaps = [new Map() , new Map() ];
    //
    // Add the test elements all at once (so only one reflow)
    // Currently, we do one test for each container element for in-line and one for display math
    //   (since we need different techniques for the two forms to avoid a WebKit bug).
    //   This may need to be changed to handle floating elements better, since that has to be
    //   done at the location of the math itself, not necessarily the end of the container.
    //
    for (const math of html.math) {
      const node = adaptor.parent(math.start.node);
      if (node && math.state() < STATE.METRICS) {
        const map = domMaps[math.display ? 1 : 0];
        if (!map.has(node)) {
          map.set(node, this.getTestElement(node, math.display));
        }
      }
    }
    //
    // Measure the metrics for all the mapped elements
    //
    const getFamily = this.options.mtextInheritFont || this.options.merrorInheritFont;
    const maps = [new Map() , new Map() ];
    for (const i of maps.keys()) {
      for (const node of domMaps[i].keys()) {
        maps[i].set(node, this.measureMetrics(domMaps[i].get(node), getFamily));
      }
    }
    //
    // Remove the test elements
    //
    for (const i of maps.keys()) {
      for (const node of domMaps[i].values()) {
        adaptor.remove(node);
      }
    }
    return maps;
  }

  /**
   * @param {N} node    The math element to be measured
   * @return {N}        The test elements that were added
   */
   getTestElement(node, display) {
    const adaptor = this.adaptor;
    if (!this.testInline) {
      this.testInline = this.html('mjx-test', {style: {
        display:            'inline-block',
        width:              '100%',
        'font-style':       'normal',
        'font-weight':      'normal',
        'font-size':        '100%',
        'font-size-adjust': 'none',
        'text-indent':      0,
        'text-transform':   'none',
        'letter-spacing':   'normal',
        'word-spacing':     'normal',
        overflow:           'hidden',
        height:             '1px',
        'margin-right':     '-1px'
      }}, [
        this.html('mjx-left-box', {style: {
          display: 'inline-block',
          width: 0,
          'float': 'left'
        }}),
        this.html('mjx-ex-box', {style: {
          position: 'absolute',
          overflow: 'hidden',
          width: '1px', height: '60ex'
        }}),
        this.html('mjx-right-box', {style: {
          display: 'inline-block',
          width: 0,
          'float': 'right'
        }})
      ]);
      this.testDisplay = adaptor.clone(this.testInline);
      adaptor.setStyle(this.testDisplay, 'display', 'table');
      adaptor.setStyle(this.testDisplay, 'margin-right', '');
      adaptor.setStyle(adaptor.firstChild(this.testDisplay) , 'display', 'none');
      const right = adaptor.lastChild(this.testDisplay) ;
      adaptor.setStyle(right, 'display', 'table-cell');
      adaptor.setStyle(right, 'width', '10000em');
      adaptor.setStyle(right, 'float', '');
    }
    return adaptor.append(node, adaptor.clone(display ? this.testDisplay : this.testInline) ) ;
  }

  /**
   * @param {N} node              The test node to measure
   * @param {boolean} getFamily   True if font family of surroundings is to be determined
   * @return {ExtendedMetrics}    The metric data for the given node
   */
   measureMetrics(node, getFamily) {
    const adaptor = this.adaptor;
    const family = (getFamily ? adaptor.fontFamily(node) : '');
    const em = adaptor.fontSize(node);
    const ex = (adaptor.nodeSize(adaptor.childNode(node, 1) )[1] / 60) || (em * this.options.exFactor);
    const containerWidth = (adaptor.getStyle(node, 'display') === 'table' ?
                            adaptor.nodeSize(adaptor.lastChild(node) )[0] - 1 :
                            adaptor.nodeBBox(adaptor.lastChild(node) ).left -
                            adaptor.nodeBBox(adaptor.firstChild(node) ).left - 2);
    const scale = Math.max(this.options.minScale,
                           this.options.matchFontHeight ? ex / this.font.params.x_height / em : 1);
    const lineWidth = 1000000;      // no linebreaking (otherwise would be a percentage of cwidth)
    return {em, ex, containerWidth, lineWidth, scale, family};
  }

  /*****************************************************************/

  /**
   * @override
   */
   styleSheet(html) {
    this.setDocument(html);
    //
    // Start with the common styles
    //
    this.cssStyles.clear();
    this.cssStyles.addStyles((this.constructor ).commonStyles);
    //
    // Add document-specific styles
    //
    if ('getStyles' in html) {
      for (const styles of ((html ).getStyles() )) {
        this.cssStyles.addStyles(styles);
      }
    }
    //
    // Gather the CSS from the classes
    //
    for (const kind of this.factory.getKinds()) {
      this.addClassStyles(this.factory.getNodeClass(kind));
    }
    //
    // Get the font styles
    //
    this.cssStyles.addStyles(this.font.styles);
    //
    // Create the stylesheet for the CSS
    //
    const sheet = this.html('style', {id: 'MJX-styles'}, [this.text('\n' + this.cssStyles.cssText + '\n')]);
    return sheet ;
  }

  /**
   * @param {any} CLASS  The Wrapper class whose styles are to be added
   */
   addClassStyles(CLASS) {
    this.cssStyles.addStyles(CLASS.styles);
  }

  /*****************************************************************/

  /**
   * @param {MathDocument} html  The document to be used
   */
   setDocument(html) {
    if (html) {
      this.document = html;
      this.adaptor.document = html.document;
    }
  }

  /**
   * @param {string} type      The type of HTML node to create
   * @param {OptionList} def   The properties to set on the HTML node
   * @param {(N|T)[]} content  Array of child nodes to set for the HTML node
   * @param {string} ns        The namespace for the element
   * @return {N}               The newly created DOM tree
   */
   html(type, def = {}, content = [], ns) {
    return this.adaptor.node(type, def, content, ns);
  }

  /**
   * @param {string} text  The text string for which to make a text node
   *
   * @return {T}  A text node with the given text
   */
   text(text) {
    return this.adaptor.text(text);
  }

  /**
   * @param {number} m    A number to be shown with a fixed number of digits
   * @param {number=} n   The number of digits to use
   * @return {string}     The formatted number
   */
   fixed(m, n = 3) {
    if (Math.abs(m) < .0006) {
      return '0';
    }
    return m.toFixed(n).replace(/\.?0+$/, '');
  }

  /*****************************************************************/
  /*
   *  Methods for handling text that is not in the current MathJax font
   */

  /**
   * Create a DOM node for text from a specific CSS font, or that is
   *  not in the current MathJax font
   *
   * @param {string} text        The text to be displayed
   * @param {string} variant     The name of the variant for the text
   * @return {N}                 The text element containing the text
   */
  

  /**
   * Measure text from a specific font, or that isn't in the MathJax font
   *
   * @param {string} text        The text to measure
   * @param {string} variant     The variant for the text
   * @param {CssFontData} font   The family, italic, and bold data for explicit fonts
   * @return {UnknownBBox}       The width, height, and depth of the text (in ems)
   */
   measureText(text, variant, font = ['', false, false]) {
    const node = this.unknownText(text, variant);
    if (variant === '-explicitFont') {
      const styles = this.cssFontStyles(font);
      this.adaptor.setAttributes(node, {style: styles});
    }
    return this.measureTextNodeWithCache(node, text, variant, font);
  }

  /**
   * Get the size of a text node, caching the result, and using
   *   a cached result, if there is one.
   *
   * @param {N} text         The text element to measure
   * @param {string} chars   The string contained in the text node
   * @param {string} variant     The variant for the text
   * @param {CssFontData} font   The family, italic, and bold data for explicit fonts
   * @return {UnknownBBox}   The width, height and depth for the text
   */
   measureTextNodeWithCache(
    text, chars, variant,
    font = ['', false, false]
  ) {
    if (variant === '-explicitFont') {
      variant = [font[0], font[1] ? 'T' : 'F', font[2] ? 'T' : 'F', ''].join('-');
    }
    if (!this.unknownCache.has(variant)) {
      this.unknownCache.set(variant, new Map());
    }
    const map = this.unknownCache.get(variant);
    const cached = map.get(chars);
    if (cached) return cached;
    const bbox = this.measureTextNode(text);
    map.set(chars, bbox);
    return bbox;
  }

  /**
   * Measure the width of a text element by placing it in the page
   *  and looking up its size (fake the height and depth, since we can't measure that)
   *
   * @param {N} text            The text element to measure
   * @return {UnknownBBox}      The width, height and depth for the text (in ems)
   */
  

  /**
   * Measure the width, height and depth of an annotation-xml node's content
   *
   * @param{N} xml          The xml content node to be measured
   * @return {UnknownBBox}  The width, height, and depth of the content
   */
   measureXMLnode(xml) {
    const adaptor = this.adaptor;
    const content =  this.html('mjx-xml-block', {style: {display: 'inline-block'}}, [adaptor.clone(xml)]);
    const base = this.html('mjx-baseline', {style: {display: 'inline-block', width: 0, height: 0}});
    const style = {
      position: 'absolute',
      display: 'inline-block',
      'font-family': 'initial',
      'line-height': 'normal'
    };
    const node = this.html('mjx-measure-xml', {style}, [base, content]);
    adaptor.append(adaptor.parent(this.math.start.node), this.container);
    adaptor.append(this.container, node);
    const em = this.math.metrics.em * this.math.metrics.scale;
    const {left, right, bottom, top} = adaptor.nodeBBox(content);
    const w = (right - left) / em;
    const h = (adaptor.nodeBBox(base).top - top) / em;
    const d = (bottom - top) / em - h;
    adaptor.remove(this.container);
    adaptor.remove(node);
    return {w, h, d};
  }

  /**
   * @param {CssFontData} font   The family, style, and weight for the given font
   * @param {StyleList} styles   The style object to add the font data to
   * @return {StyleList}         The modified (or initialized) style object
   */
   cssFontStyles(font, styles = {}) {
    const [family, italic, bold] = font;
    styles['font-family'] = this.font.getFamily(family);
    if (italic) styles['font-style'] = 'italic';
    if (bold) styles['font-weight'] = 'bold';
    return styles;
  }

  /**
   * @param {Styles} styles   The style object to query
   * @return {CssFontData}    The family, italic, and boolean values
   */
   getFontData(styles) {
    if (!styles) {
      styles = new Styles();
    }
    return [this.font.getFamily(styles.get('font-family')),
            styles.get('font-style') === 'italic',
            styles.get('font-weight') === 'bold'] ;
  }

} CommonOutputJax.__initStatic(); CommonOutputJax.__initStatic2(); CommonOutputJax.__initStatic3();

/*****************************************************************/
/**
 * The generic WrapperFactory class
 *
 * @template N  The Node type being created by the factory
 * @template W  The Wrapper type being produced (instance type)
 * @template C  The Wrapper class (for static values)
 */










/*****************************************************************/
/**
 * The generic WrapperFactory class
 *
 * @template N  The Node type being created by the factory
 * @template W  The Wrapper type being produced (instance type)
 * @template C  The Wrapper class (for static values)
 */
class AbstractWrapperFactory
extends AbstractFactory {
  /**
   * @param {N} node  The node to be wrapped
   * @param {any[]} args  Any additional arguments needed when wrapping the node
   * @return {W}  The newly wrapped node
   */
   wrap(node, ...args) {
    return this.create(node.kind, node, ...args);
  }
}

/*****************************************************************/
/**
 *  The OutputWrapperFactory class for creating OutputWrapper nodes
 *
 * @template J  The OutputJax type
 * @template W  The Wrapper type
 * @template C  The WrapperClass type
 * @template CC The CharOptions type
 * @template FD The FontData type
 */
class CommonWrapperFactory






 extends AbstractWrapperFactory {constructor(...args) { super(...args); CommonWrapperFactory.prototype.__init.call(this); }

  /**
   * The default list of wrapper nodes this factory can create
   *   (filled in by subclasses)
   */
   static __initStatic() {this.defaultNodes = {};}

  /**
   * The output jax associated with this factory
   */
   __init() {this.jax = null;}

  /**
   * @return {Object}  The list of node-creation functions
   */
  get Wrappers() {
    return this.node;
  }

} CommonWrapperFactory.__initStatic();

/*********************************************************/
/**
 *  The Wrapper interface
 *
 *  It points to a Node object.  Subclasses add methods for the visitor to call.
 *
 * @template N  The Node type being wrapped
 * @template W  The Wrapper type being produced
 */





























/*********************************************************/
/**
 *  The abstract Wrapper class
 *
 * @template N  The Node type being created by the factory
 * @template W  The Wrapper type being produced
 */
class AbstractWrapper {
  /**
   * The Node object associated with this instance
   */
  

  /**
   * The WrapperFactory to use to wrap child nodes, as needed
   */
  

  /**
   * The kind of this wrapper
   */
  get kind() {
    return this.node.kind;
  }

  /**
   * @param {WrapperFactory} factory  The WrapperFactory to use to wrap child nodes when needed
   * @param {Node} node               The node to wrap
   *
   * @constructor
   * @implements {Wrapper}
   */
  constructor(factory, node) {
    this.factory = factory;
    this.node = node;
  }

  /**
   * @override
   */
   wrap(node) {
    return this.factory.wrap(node);
  }

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 *  The data used to initialize a BBox
 */






/*****************************************************************/
/**
 *  The BBox class
 */

class BBox {
  /**
   * Constant for pwidth of full width box
   */
   static __initStatic() {this.fullWidth = '100%';}

  /**
   *  These are the data stored for a bounding box
   */
  /* tslint:disable:jsdoc-require */
  
  
  
  
   // scale relative to the parent's scale
        // extra space on the left
        // extra space on the right
   // percentage width (for tables)
       // italic correction
       // skew
  /* tslint:enable */

  /**
   * @return {BBox}  A BBox initialized to zeros
   */
   static zero() {
    return new BBox({h: 0, d: 0, w: 0});
  }

  /**
   * @return {BBox}  A BBox with height and depth not set
   */
   static empty() {
    return new BBox();
  }

  /**
   * @param {BBoxData} def  The data with which to initialize the BBox
   *
   * @constructor
   */
  constructor(def = {w: 0, h: -BIGDIMEN, d: -BIGDIMEN}) {
    this.w = def.w || 0;
    this.h = ('h' in def ? def.h : -BIGDIMEN);
    this.d = ('d' in def ? def.d : -BIGDIMEN);
    this.L = this.R = this.ic = this.sk = 0;
    this.scale = this.rscale = 1;
    this.pwidth = '';
  }

  /**
   * Set up a bbox for append() and combine() operations
   * @return {BBox}  the boox itself (for chaining calls)
   */
   empty() {
    this.w = 0;
    this.h = this.d = -BIGDIMEN;
    return this;
  }

  /**
   * Convert any unspecified values into zeros
   */
   clean () {
    if (this.w === -BIGDIMEN) this.w = 0;
    if (this.h === -BIGDIMEN) this.h = 0;
    if (this.d === -BIGDIMEN) this.d = 0;
  }

  /**
   * @param {number} scale  The scale to use to modify the bounding box size
   */
   rescale(scale) {
    this.w *= scale;
    this.h *= scale;
    this.d *= scale;
  }

  /**
   * @param {BBox} cbox  A bounding to combine with this one
   * @param {number} x   An x-offest for the child bounding box
   * @param {number} y   A y-offset for the child bounding box
   */
   combine(cbox, x = 0, y = 0) {
    let rscale = cbox.rscale;
    let w = x + rscale * (cbox.w + cbox.L + cbox.R);
    let h = y + rscale * cbox.h;
    let d = rscale * cbox.d - y;
    if (w > this.w) this.w = w;
    if (h > this.h) this.h = h;
    if (d > this.d) this.d = d;
  }

  /**
   * @param {BBox} cbox  A bounding box to be added to the right of this one
   */
   append(cbox) {
    let scale = cbox.rscale;
    this.w += scale * (cbox.w + cbox.L + cbox.R);
    if (scale * cbox.h > this.h) {
      this.h = scale * cbox.h;
    }
    if (scale * cbox.d > this.d) {
      this.d = scale * cbox.d;
    }
  }

  /**
   * @param {BBox} cbox  The bounding box to use to overwrite this one
   */
   updateFrom(cbox) {
    this.h = cbox.h;
    this.d = cbox.d;
    this.w = cbox.w;
    if (cbox.pwidth) {
      this.pwidth = cbox.pwidth;
    }
  }

} BBox.__initStatic();

/****************************************************************************/

/**
 * The extra options allowed in a CharData array
 */


















































































/****************************************************************************/

/**
 * Stretchy delimiter data
 */
var DIRECTION; (function (DIRECTION) {const None = 0; DIRECTION[DIRECTION["None"] = None] = "None"; const Vertical = None + 1; DIRECTION[DIRECTION["Vertical"] = Vertical] = "Vertical"; const Horizontal = Vertical + 1; DIRECTION[DIRECTION["Horizontal"] = Horizontal] = "Horizontal";})(DIRECTION || (DIRECTION = {}));
const V = DIRECTION.Vertical;
const H = DIRECTION.Horizontal;

/****************************************************************************/

/**
 * Data needed for stretchy vertical and horizontal characters
 */





















/**
 * Delimiter data for a non-stretchy character
 */
const NOSTRETCH = {dir: DIRECTION.None};

/****************************************************************************/

/**
 * Data for remapping characters
 */






























































/****************************************************************************/
/**
 *  The FontData class (for storing character bounding box data by variant,
 *                      and the stretchy delimiter data).
 *
 * @template C  The CharOptions type
 * @template V  The VariantData type
 * @template D  The DelimiterData type
 */
class FontData {

  /**
   * Subclasses may need options
   */
   static __initStatic() {this.OPTIONS = {};}

  /**
   *  The standard variants to define
   */
   static __initStatic2() {this.defaultVariants = [
    ['normal'],
    ['bold', 'normal'],
    ['italic', 'normal'],
    ['bold-italic', 'italic', 'bold'],
    ['double-struck', 'bold'],
    ['fraktur', 'normal'],
    ['bold-fraktur', 'bold', 'fraktur'],
    ['script', 'italic'],
    ['bold-script', 'bold-italic', 'script'],
    ['sans-serif', 'normal'],
    ['bold-sans-serif', 'bold', 'sans-serif'],
    ['sans-serif-italic', 'italic', 'sans-serif'],
    ['sans-serif-bold-italic', 'bold-italic', 'bold-sans-serif'],
    ['monospace', 'normal']
  ];}

  /**
   * The style and weight to use for each variant (for unkown characters)
   */
   static __initStatic3() {this.defaultCssFonts = {
    normal: ['serif', false, false],
    bold: ['serif', false, true],
    italic: ['serif', true, false],
    'bold-italic': ['serif', true, true],
    'double-struck': ['serif', false, true],
    fraktur: ['serif', false, false],
    'bold-fraktur': ['serif', false, true],
    script: ['cursive', false, false],
    'bold-script': ['cursive', false, true],
    'sans-serif': ['sans-serif', false, false],
    'bold-sans-serif': ['sans-serif', false, true],
    'sans-serif-italic': ['sans-serif', true, false],
    'sans-serif-bold-italic': ['sans-serif', true, true],
    monospace: ['monospace', false, false]
  };}

  /**
   * The default prefix for explicit font-family settings
   */
   static __initStatic4() {this.defaultCssFamilyPrefix = '';}

  /**
   * Variant locations in the Math Alphabnumerics block:
   *  [upper-alpha, lower-alpha, upper-Greek, lower-Greek, numbers]
   */
   static __initStatic5() {this.VariantSmp = {
    bold: [0x1D400, 0x1D41A, 0x1D6A8, 0x1D6C2, 0x1D7CE],
    italic: [0x1D434, 0x1D44E, 0x1D6E2, 0x1D6FC],
    'bold-italic': [0x1D468, 0x1D482, 0x1D71C, 0x1D736],
    script: [0x1D49C, 0x1D4B6],
    'bold-script': [0x1D4D0, 0x1D4EA],
    fraktur: [0x1D504, 0x1D51E],
    'double-struck': [0x1D538, 0x1D552, , , 0x1D7D8],
    'bold-fraktur': [0x1D56C, 0x1D586],
    'sans-serif': [0x1D5A0, 0x1D5BA, , , 0x1D7E2],
    'bold-sans-serif': [0x1D5D4, 0x1D5EE, 0x1D756, 0x1D770, 0x1D7EC],
    'sans-serif-italic': [0x1D608, 0x1D622],
    'sans-serif-bold-italic': [0x1D63C, 0x1D656, 0x1D790, 0x1D7AA],
    'monospace': [0x1D670, 0x1D68A, , , 0x1D7F6]
  };}

  /**
   * Character ranges to remap into Math Alphanumerics
   */
   static __initStatic6() {this.SmpRanges = [
    [0, 0x41, 0x5A],   // Upper-case alpha
    [1, 0x61, 0x7A],   // Lower-case alpha
    [2, 0x391, 0x3A9], // Upper-case Greek
    [3, 0x3B1, 0x3C9], // Lower-case Greek
    [4, 0x30, 0x39]    // Numbers
  ];}

  /**
   * Characters to map back top other Unicode positions
   * (holes in the Math Alphanumeric ranges)
   */
   static __initStatic7() {this.SmpRemap = {
    0x1D455: 0x210E,   // PLANCK CONSTANT
    0x1D49D: 0x212C,   // SCRIPT CAPITAL B
    0x1D4A0: 0x2130,   // SCRIPT CAPITAL E
    0x1D4A1: 0x2131,   // SCRIPT CAPITAL F
    0x1D4A3: 0x210B,   // SCRIPT CAPITAL H
    0x1D4A4: 0x2110,   // SCRIPT CAPITAL I
    0x1D4A7: 0x2112,   // SCRIPT CAPITAL L
    0x1D4A8: 0x2133,   // SCRIPT CAPITAL M
    0x1D4AD: 0x211B,   // SCRIPT CAPITAL R
    0x1D4BA: 0x212F,   // SCRIPT SMALL E
    0x1D4BC: 0x210A,   // SCRIPT SMALL G
    0x1D4C4: 0x2134,   // SCRIPT SMALL O
    0x1D506: 0x212D,   // BLACK-LETTER CAPITAL C
    0x1D50B: 0x210C,   // BLACK-LETTER CAPITAL H
    0x1D50C: 0x2111,   // BLACK-LETTER CAPITAL I
    0x1D515: 0x211C,   // BLACK-LETTER CAPITAL R
    0x1D51D: 0x2128,   // BLACK-LETTER CAPITAL Z
    0x1D53A: 0x2102,   // DOUBLE-STRUCK CAPITAL C
    0x1D53F: 0x210D,   // DOUBLE-STRUCK CAPITAL H
    0x1D545: 0x2115,   // DOUBLE-STRUCK CAPITAL N
    0x1D547: 0x2119,   // DOUBLE-STRUCK CAPITAL P
    0x1D548: 0x211A,   // DOUBLE-STRUCK CAPITAL Q
    0x1D549: 0x211D,   // DOUBLE-STRUCK CAPITAL R
    0x1D551: 0x2124,   // DOUBLE-STRUCK CAPITAL Z
  };}

  /**
   * Greek upper-case variants
   */
   static __initStatic8() {this.SmpRemapGreekU = {
    0x2207: 0x19,  // nabla
    0x03F4: 0x11   // theta symbol
  };}

  /**
   * Greek lower-case variants
   */
   static __initStatic9() {this.SmpRemapGreekL = {
    0x3D1: 0x1B,  // theta symbol
    0x3D5: 0x1D,  // phi symbol
    0x3D6: 0x1F,  // omega symbol
    0x3F0: 0x1C,  // kappa symbol
    0x3F1: 0x1E,  // rho symbol
    0x3F5: 0x1A,  // lunate epsilon symbol
    0x2202: 0x19  // partial differential
  };}

  /**
   *  The default remappings
   */
   static __initStatic10() {this.defaultAccentMap = {
    0x0300: '\u02CB',  // grave accent
    0x0301: '\u02CA',  // acute accent
    0x0302: '\u02C6',  // curcumflex
    0x0303: '\u02DC',  // tilde accent
    0x0304: '\u02C9',  // macron
    0x0306: '\u02D8',  // breve
    0x0307: '\u02D9',  // dot
    0x0308: '\u00A8',  // diaresis
    0x030A: '\u02DA',  // ring above
    0x030C: '\u02C7',  // caron
    0x2192: '\u20D7',
    0x2032: '\'',
    0x2033: '\'\'',
    0x2034: '\'\'\'',
    0x2035: '`',
    0x2036: '``',
    0x2037: '```',
    0x2057: '\'\'\'\'',
    0x20D0: '\u21BC', // combining left harpoon
    0x20D1: '\u21C0', // combining right harpoon
    0x20D6: '\u2190', // combining left arrow
    0x20E1: '\u2194', // combining left-right arrow
    0x20F0: '*',      // combining asterisk
    0x20DB: '...',    // combining three dots above
    0x20DC: '....',   // combining four dots above
    0x20EC: '\u21C1', // combining low left harpoon
    0x20ED: '\u21BD', // combining low right harpoon
    0x20EE: '\u2190', // combining low left arrows
    0x20EF: '\u2192'  // combining low right arrows
  };}

  /**
   * Default map for characters inside <mo>
   */
   static __initStatic11() {this.defaultMoMap = {
    0x002D: '\u2212' // hyphen
  };}

  /**
   * Default map for characters inside <mn>
   */
   static __initStatic12() {this.defaultMnMap = {
    0x002D: '\u2212' // hyphen
  };}

  /**
   *  The default font parameters for the font
   */
   static __initStatic13() {this.defaultParams = {
    x_height:         .442,
    quad:             1,
    num1:             .676,
    num2:             .394,
    num3:             .444,
    denom1:           .686,
    denom2:           .345,
    sup1:             .413,
    sup2:             .363,
    sup3:             .289,
    sub1:             .15,
    sub2:             .247,
    sup_drop:         .386,
    sub_drop:         .05,
    delim1:          2.39,
    delim2:          1.0,
    axis_height:      .25,
    rule_thickness:   .06,
    big_op_spacing1:  .111,
    big_op_spacing2:  .167,
    big_op_spacing3:  .2,
    big_op_spacing4:  .6,
    big_op_spacing5:  .1,

    surd_height:      .075,

    scriptspace:         .05,
    nulldelimiterspace:  .12,
    delimiterfactor:     901,
    delimitershortfall:   .3,

    min_rule_thickness:  1.25     // in pixels
  };}

  /**
   * The default delimiter data
   */
   static __initStatic14() {this.defaultDelimiters = {};}
  /**
   * The default character data
   */
   static __initStatic15() {this.defaultChars = {};}

  /**
   * The default variants for the fixed size stretchy delimiters
   */
   static __initStatic16() {this.defaultSizeVariants = [];}

  /**
   * The actual variant information for this font
   */
   __init() {this.variant = {};}
  /**
   * The actual delimiter information for this font
   */
   __init2() {this.delimiters = {};}
  /**
   * The actual size information for this font
   */
  
  /**
   * The data to use to make variants to default fonts and css for unknown characters
   */
   __init3() {this.cssFontMap = {};}

  /**
   * A prefix to use for explicit font-family CSS settings
   */
  

  /**
   * The character maps
   */
   __init4() {this.remapChars = {};}

  /**
   * The actual font parameters for this font
   */
  

  /**
   * Any styles needed for the font
   */
  

  /**
   * @param {CharMap} font   The font to check
   * @param {number} n       The character to get options for
   * @return {CharOptions}   The options for the character
   */
   static charOptions(font, n) {
    const char = font[n];
    if (char.length === 3) {
      (char )[3] = {};
    }
    return char[3];
  }

  /**
   * Copies the data from the defaults to the instance
   *
   * @constructor
   */
  constructor() {FontData.prototype.__init.call(this);FontData.prototype.__init2.call(this);FontData.prototype.__init3.call(this);FontData.prototype.__init4.call(this);
    let CLASS = (this.constructor );
    this.params = {...CLASS.defaultParams};
    this.sizeVariants = [...CLASS.defaultSizeVariants];
    this.cssFontMap = {...CLASS.defaultCssFonts};
    this.cssFamilyPrefix = CLASS.defaultCssFamilyPrefix;
    this.createVariants(CLASS.defaultVariants);
    this.defineDelimiters(CLASS.defaultDelimiters);
    for (const name of Object.keys(CLASS.defaultChars)) {
      this.defineChars(name, CLASS.defaultChars[name]);
    }
    this.defineRemap('accent', CLASS.defaultAccentMap);
    this.defineRemap('mo', CLASS.defaultMoMap);
    this.defineRemap('mn', CLASS.defaultMnMap);
  }

  /**
   * Creates the data structure for a variant -- an object with
   *   prototype chain that includes a copy of the linked variant,
   *   and then the inherited variant chain.
   *
   *   The reason for this extra link is that for a mathvariant like
   *   bold-italic, you want to inherit from both the bold and
   *   italic variants, but the prototype chain can only inherit
   *   from one. So for bold-italic, we make an object that has a
   *   prototype consisting of a copy of the bold data, and add the
   *   italic data as the prototype chain. (Since this is a copy, we
   *   keep a record of this link so that if bold is changed later,
   *   we can update this copy. That is not needed for the prototype
   *   chain, since the prototypes are the actual objects, not
   *   copies.) We then use this bold-plus-italic object as the
   *   prototype chain for the bold-italic object
   *
   *   That means that bold-italic will first look in its own object
   *   for specifically bold-italic glyphs that are defined there,
   *   then in the copy of the bold glyphs (only its top level is
   *   copied, not its prototype chain), and then the specifically
   *   italic glyphs, and then the prototype chain for italics,
   *   which is the normal glyphs. Effectively, this means
   *   bold-italic looks for bold-italic, then bold, then italic,
   *   then normal glyphs in order to find the given character.
   *
   * @param {string} name     The new variant to create
   * @param {string} inherit  The variant to use if a character is not in this one
   * @param {string} link     A variant to search before the inherit one (but only
   *                           its top-level object).
   */
   createVariant(name, inherit = null, link = null) {
    let variant = {
      linked: [] ,
      chars: (inherit ? Object.create(this.variant[inherit].chars) : {}) 
    } ;
    if (link && this.variant[link]) {
      Object.assign(variant.chars, this.variant[link].chars);
      this.variant[link].linked.push(variant.chars);
      variant.chars = Object.create(variant.chars);
    }
    this.remapSmpChars(variant.chars, name);
    this.variant[name] = variant;
  }

  /**
   * Create the mapping from Basic Latin and Greek blocks to
   * the Math Alphanumeric block for a given variant.
   */
   remapSmpChars(chars, name) {
    const CLASS = (this.constructor );
    if (CLASS.VariantSmp[name]) {
      const SmpRemap = CLASS.SmpRemap;
      const SmpGreek = [null, null, CLASS.SmpRemapGreekU, CLASS.SmpRemapGreekL];
      for (const [i, lo, hi] of CLASS.SmpRanges) {
        const base = CLASS.VariantSmp[name][i];
        if (!base) continue;
        for (let n = lo; n <= hi; n++) {
          if (n === 0x3A2) continue;
          const smp = base + n - lo;
          chars[n] = this.smpChar(SmpRemap[smp] || smp);
        }
        if (SmpGreek[i]) {
          for (const n of Object.keys(SmpGreek[i]).map((x) => parseInt(x))) {
            chars[n] = this.smpChar(base + SmpGreek[i][n]);
          }
        }
      }
    }
    if (name === 'bold') {
      chars[0x3DC] = this.smpChar(0x1D7CA);
      chars[0x3DD] = this.smpChar(0x1D7CB);
    }
  }

  /**
   * @param {number} n      Math Alphanumerics position for this remapping
   * @return {CharData<C>}  The character data for the remapping
   */
   smpChar(n) {
    return [ , , , {smp: n} ];
  }

  /**
   * Create a collection of variants
   *
   * @param {string[][]} variants  Array of [name, inherit?, link?] values for
   *                              the variants to define
   */
   createVariants(variants) {
    for (const variant of variants) {
      this.createVariant(variant[0], variant[1], variant[2]);
    }
  }

  /**
   * Defines new character data in a given variant
   *  (We use Object.assign() here rather than the spread operator since
   *  the character maps are objeccts with prototypes, and we don't
   *  want to loose those by doing {...chars} or something similar.)
   *
   * @param {string} name    The variant for these characters
   * @param {CharMap} chars  The characters to define
   */
   defineChars(name, chars) {
    let variant = this.variant[name];
    Object.assign(variant.chars, chars);
    for (const link of variant.linked) {
      Object.assign(link, chars);
    }
  }

  /**
   * Defines stretchy delimiters
   *
   * @param {DelimiterMap} delims  The delimiters to define
   */
   defineDelimiters(delims) {
    Object.assign(this.delimiters, delims);
  }

  /**
   * Defines a character remapping map
   *
   * @param {string} name     The name of the map to define or augment
   * @param {RemapMap} remap  The characters to remap
   */
   defineRemap(name, remap) {
    if (!this.remapChars.hasOwnProperty(name)) {
      this.remapChars[name] = {};
    }
    Object.assign(this.remapChars[name], remap);
  }

  /**
   * @param {number} n  The delimiter character number whose data is desired
   * @return {DelimiterData}  The data for that delimiter (or undefined)
   */
   getDelimiter(n) {
    return this.delimiters[n];
  }

  /**
   * @param {number} n  The delimiter character number whose variant is needed
   * @param {number} i  The index in the size array of the size whose variant is needed
   * @return {string}   The variant of the i-th size for delimiter n
   */
   getSizeVariant(n, i) {
    if (this.delimiters[n].variants) {
      i = this.delimiters[n].variants[i];
    }
    return this.sizeVariants[i];
  }

  /**
   * @param {string} name  The variant whose character data is being querried
   * @param {number} n     The unicode number for the character to be found
   * @return {CharData}    The data for the given character (or undefined)
   */
   getChar(name, n) {
    return this.variant[name].chars[n];
  }

  /**
   * @param {string} name   The name of the variant whose data is to be obtained
   * @return {V}            The data for the requested variant (or undefined)
   */
   getVariant(name) {
    return this.variant[name];
  }

  /**
   * @param {string} variant   The name of the variant whose data is to be obtained
   * @return {CssFontData}     The CSS data for the requested variant
   */
   getCssFont(variant) {
    return this.cssFontMap[variant] || ['serif', false, false];
  }

  /**
   * @param {string} family   The font camily to use
   * @return {string}         The family with the css prefix
   */
   getFamily(family) {
    return (this.cssFamilyPrefix ? this.cssFamilyPrefix + ', ' + family : family);
  }

  /**
   * @param {string} name   The name of the map to query
   * @param {number} c      The character to remap
   * @return {string}       The remapped character (or the original)
   */
   getRemappedChar(name, c) {
    const map = this.remapChars[name] || {} ;
    return map[c];
  }

} FontData.__initStatic(); FontData.__initStatic2(); FontData.__initStatic3(); FontData.__initStatic4(); FontData.__initStatic5(); FontData.__initStatic6(); FontData.__initStatic7(); FontData.__initStatic8(); FontData.__initStatic9(); FontData.__initStatic10(); FontData.__initStatic11(); FontData.__initStatic12(); FontData.__initStatic13(); FontData.__initStatic14(); FontData.__initStatic15(); FontData.__initStatic16();

/**
 * The class interface for the FontData class
 *
 * @template C  The CharOptions type
 * @template V  The VariantData type
 * @template D  The DelimiterData type
 */

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/

/**
 * Shorthand for a dictionary object (an object of key:value pairs)
 */


/**
 * MathML spacing rules
 */
/* tslint:disable-next-line:whitespace */
const SMALLSIZE = 2/18;

/**
 * @param {boolean} script   The scriptlevel
 * @param {number} size      The space size
 * @return {number}          The size clamped to SMALLSIZE when scriptlevel > 0
 */
function MathMLSpace(script, size) {
  return (script ? size < SMALLSIZE ? 0 : SMALLSIZE : size);
}


































/*****************************************************************/
/**
 *  The base CommonWrapper class
 *
 * @template J  The OutputJax type
 * @template W  The Wrapper type
 * @template C  The WrapperClass type
 * @template CC The CharOptions type
 * @template FD The FontData type
 */
class CommonWrapper






 extends AbstractWrapper {

  /**
   * The wrapper kind
   */
   static __initStatic() {this.kind = 'unknown';}

  /**
   * Any styles needed for the class
   */
   static __initStatic2() {this.styles = {};}

  /**
   * Styles that should not be passed on from style attribute
   */
   static __initStatic3() {this.removeStyles = [
    'fontSize', 'fontFamily', 'fontWeight',
    'fontStyle', 'fontVariant', 'font'
  ];}

  /**
   * Non-MathML attributes on MathML elements NOT to be copied to the
   * corresponding DOM elements.  If set to false, then the attribute
   * WILL be copied.  Most of these (like the font attributes) are handled
   * in other ways.
   */
   static __initStatic4() {this.skipAttributes = {
    fontfamily: true, fontsize: true, fontweight: true, fontstyle: true,
    color: true, background: true,
    'class': true, href: true, style: true,
    xmlns: true
  };}

  /**
   * The translation of mathvariant to bold styles, or to remove
   * bold from a mathvariant.
   */
   static __initStatic5() {this.BOLDVARIANTS =  {
    bold: {
      normal: 'bold',
      italic: 'bold-italic',
      fraktur: 'bold-fraktur',
      script: 'bold-script',
      'sans-serif': 'bold-sans-serif',
      'sans-serif-italic': 'sans-serif-bold-italic'
    },
    normal: {
      bold: 'normal',
      'bold-italic': 'italic',
      'bold-fraktur': 'fraktur',
      'bold-script': 'script',
      'bold-sans-serif': 'sans-serif',
      'sans-serif-bold-italic': 'sans-serif-italic'
    }
  };}

  /**
   * The translation of mathvariant to italic styles, or to remove
   * italic from a mathvariant.
   */
   static __initStatic6() {this.ITALICVARIANTS = {
    italic: {
      normal: 'italic',
      bold: 'bold-italic',
      'sans-serif': 'sans-serif-italic',
      'bold-sans-serif': 'sans-serif-bold-italic'
    },
    normal: {
      italic: 'normal',
      'bold-italic': 'bold',
      'sans-serif-italic': 'sans-serif',
      'sans-serif-bold-italic': 'bold-sans-serif'
    }
  };}

  /**
   * The factory used to create more wrappers
   */
  

  /**
   * The parent of this node
   */
   __init() {this.parent = null;}

  /**
   * The children of this node
   */
  

  /**
   * Styles that must be handled directly by the wrappers (mostly having to do with fonts)
   */
   __init2() {this.removedStyles = null;}

  /**
   * The explicit styles set by the node
   */
   __init3() {this.styles = null;}

  /**
   * The mathvariant for this node
   */
   __init4() {this.variant = '';}

  /**
   * The bounding box for this node
   */
  
  /**
   * Whether the bounding box has been computed yet
   */
   __init5() {this.bboxComputed = false;}

  /**
   * Delimiter data for stretching this node (NOSTRETCH means not yet determined)
   */
   __init6() {this.stretch = NOSTRETCH; }

  /**
   * Easy access to the font parameters
   */
   __init7() {this.font = null;}

  /**
   * Easy access to the output jax for this node
   */
  get jax() {
    return this.factory.jax;
  }

  /**
   * Easy access to the DOMAdaptor object
   */
  get adaptor() {
    return this.factory.jax.adaptor;
  }

  /**
   * Easy access to the metric data for this node
   */
  get metrics() {
    return this.factory.jax.math.metrics;
  }

  /**
   * True if children with percentage widths should be resolved by this container
   */
  get fixesPWidth() {
    return !this.node.notParent && !this.node.isToken;
  }

  /*******************************************************************/

  /**
   * @override
   */
  constructor(factory, node, parent = null) {
    super(factory, node);CommonWrapper.prototype.__init.call(this);CommonWrapper.prototype.__init2.call(this);CommonWrapper.prototype.__init3.call(this);CommonWrapper.prototype.__init4.call(this);CommonWrapper.prototype.__init5.call(this);CommonWrapper.prototype.__init6.call(this);CommonWrapper.prototype.__init7.call(this);    this.parent = parent;
    this.font = factory.jax.font;
    this.bbox = BBox.zero();
    this.getStyles();
    this.getVariant();
    this.getScale();
    this.getSpace();
    this.childNodes = node.childNodes.map((child) => {
      const wrapped = this.wrap(child);
      if (wrapped.bbox.pwidth && (node.notParent || node.isKind('math'))) {
        this.bbox.pwidth = BBox.fullWidth;
      }
      return wrapped;
    });
  }

  /**
   * @param {MmlNode} node  The node to the wrapped
   * @param {W} parent  The wrapped parent node
   * @return {W}  The newly wrapped node
   */
   wrap(node, parent = null) {
    const wrapped = this.factory.wrap(node, parent || this);
    if (parent) {
      parent.childNodes.push(wrapped);
    }
    this.jax.nodeMap.set(node, wrapped);
    return wrapped;
  }

  /*******************************************************************/
  /**
   * Return the wrapped node's bounding box, either the cached one, if it exists,
   *   or computed directly if not.
   *
   * @param {boolean} save  Whether to cache the bbox or not (used for stretchy elements)
   * @return {BBox}  The computed bounding box
   */
   getBBox(save = true) {
    if (this.bboxComputed) {
      return this.bbox;
    }
    const bbox = (save ? this.bbox : BBox.zero());
    this.computeBBox(bbox);
    this.bboxComputed = save;
    return bbox;
  }

  /**
   * @param {BBox} bbox           The bounding box to modify (either this.bbox, or an empty one)
   * @param {boolean} recompute   True if we are recomputing due to changes in children that have percentage widths
   */
   computeBBox(bbox, recompute = false) {
    bbox.empty();
    for (const child of this.childNodes) {
      bbox.append(child.getBBox());
    }
    bbox.clean();
    if (this.fixesPWidth && this.setChildPWidths(recompute)) {
      this.computeBBox(bbox, true);
    }
  }

  /**
   * Recursively resolve any percentage widths in the child nodes using the given
   *   container width (or the child width, if none was passed).
   *   Overriden for mtables in order to compute the width.
   *
   * @param {boolean} recompute  True if we are recomputing due to changes in children
   * @param {(number|null)=} w   The width of the container (from which percentages are computed)
   * @param {boolean=} clear     True if pwidth marker is to be cleared
   * @return {boolean}           True if a percentage width was found
   */
   setChildPWidths(recompute, w = null, clear = true) {
    if (recompute) {
      return false;
    }
    if (clear) {
      this.bbox.pwidth = '';
    }
    let changed = false;
    for (const child of this.childNodes) {
      const cbox = child.getBBox();
      if (cbox.pwidth && child.setChildPWidths(recompute, w === null ? cbox.w : w, clear)) {
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Mark BBox to be computed again (e.g., when an mo has stretched)
   */
   invalidateBBox() {
    if (this.bboxComputed) {
      this.bboxComputed = false;
      if (this.parent) {
        this.parent.invalidateBBox();
      }
    }
  }

  /**
   * Copy child skew and italic correction
   *
   * @param {BBox} bbox  The bounding box to modify
   */
   copySkewIC(bbox) {
    const first = this.childNodes[0];
    if (first && first.bbox.sk) {
      bbox.sk = first.bbox.sk;
    }
    const last = this.childNodes[this.childNodes.length - 1];
    if (last && last.bbox.ic) {
      bbox.ic = last.bbox.ic;
      bbox.w += bbox.ic;
    }
  }

  /*******************************************************************/

  /**
   * Add the style attribute, but remove any font-related styles
   *   (since these are handled separately by the variant)
   */
   getStyles() {
    const styleString = this.node.attributes.getExplicit('style') ;
    if (!styleString) return;
    const style = this.styles = new Styles(styleString);
    for (let i = 0, m = CommonWrapper.removeStyles.length; i < m; i++) {
      const id = CommonWrapper.removeStyles[i];
      if (style.get(id)) {
        if (!this.removedStyles) this.removedStyles = {};
        this.removedStyles[id] = style.get(id);
        style.set(id, '');
      }
    }
  }

  /**
   * Get the mathvariant (or construct one, if needed).
   */
   getVariant() {
    if (!this.node.isToken) return;
    const attributes = this.node.attributes;
    let variant = attributes.get('mathvariant') ;
    if (!attributes.getExplicit('mathvariant')) {
      const values = attributes.getList('fontfamily', 'fontweight', 'fontstyle') ;
      if (this.removedStyles) {
        const style = this.removedStyles;
        if (style.fontFamily) values.family = style.fontFamily;
        if (style.fontWeight) values.weight = style.fontWeight;
        if (style.fontStyle)  values.style  = style.fontStyle;
      }
      if (values.fontfamily) values.family = values.fontfamily;
      if (values.fontweight) values.weight = values.fontweight;
      if (values.fontstyle)  values.style  = values.fontstyle;
      if (values.weight && values.weight.match(/^\d+$/)) {
        values.weight = (parseInt(values.weight) > 600 ? 'bold' : 'normal');
      }
      if (values.family) {
        variant = this.explicitVariant(values.family, values.weight, values.style);
      } else {
        if (this.node.getProperty('variantForm')) variant = '-tex-variant';
        variant = (CommonWrapper.BOLDVARIANTS[values.weight] || {})[variant] || variant;
        variant = (CommonWrapper.ITALICVARIANTS[values.style] || {})[variant] || variant;
      }
    }
    this.variant = variant;
  }

  /**
   * Set the CSS for a token element having an explicit font (rather than regular mathvariant).
   *
   * @param {string} fontFamily  The font family to use
   * @param {string} fontWeight  The font weight to use
   * @param {string} fontStyle   The font style to use
   */
   explicitVariant(fontFamily, fontWeight, fontStyle) {
    let style = this.styles;
    if (!style) style = this.styles = new Styles();
    style.set('fontFamily', fontFamily);
    if (fontWeight) style.set('fontWeight', fontWeight);
    if (fontStyle)  style.set('fontStyle', fontStyle);
    return '-explicitFont';
  }

  /**
   * Determine the scaling factor to use for this wrapped node, and set the styles for it.
   */
   getScale() {
    let scale = 1, parent = this.parent;
    let pscale = (parent ? parent.bbox.scale : 1);
    let attributes = this.node.attributes;
    let scriptlevel = Math.min(attributes.get('scriptlevel') , 2);
    let fontsize = attributes.get('fontsize');
    let mathsize = (this.node.isToken || this.node.isKind('mstyle') ?
                    attributes.get('mathsize') : attributes.getInherited('mathsize'));
    //
    // If scriptsize is non-zero, set scale based on scriptsizemultiplier
    //
    if (scriptlevel !== 0) {
      scale = Math.pow(attributes.get('scriptsizemultiplier') , scriptlevel);
      let scriptminsize = this.length2em(attributes.get('scriptminsize'), .8, 1);
      if (scale < scriptminsize) scale = scriptminsize;
    }
    //
    // If there is style="font-size:...", and not fontsize attribute, use that as fontsize
    //
    if (this.removedStyles && this.removedStyles.fontSize && !fontsize) {
      fontsize = this.removedStyles.fontSize;
    }
    //
    // If there is a fontsize and no mathsize attribute, is that
    //
    if (fontsize && !attributes.getExplicit('mathsize')) {
      mathsize = fontsize;
    }
    //
    //  Incorporate the mathsize, if any
    //
    if (mathsize !== '1') {
      scale *= this.length2em(mathsize, 1, 1);
    }
    //
    // Record the scaling factors and set the element's CSS
    //
    this.bbox.scale = scale;
    this.bbox.rscale = scale / pscale;
  }

  /**
   * Sets the spacing based on TeX or MathML algorithm
   */
   getSpace() {
    const isTop = this.isTopEmbellished();
    const hasSpacing = this.node.hasSpacingAttributes();
    if (this.jax.options.mathmlSpacing || hasSpacing) {
      isTop && this.getMathMLSpacing();
    } else {
      this.getTeXSpacing(isTop, hasSpacing);
    }
  }

  /**
   * Get the spacing using MathML rules based on the core MO
   */
   getMathMLSpacing() {
    const node = this.node.coreMO() ;
    const attributes = node.attributes;
    const isScript = (attributes.get('scriptlevel') > 0);
    this.bbox.L = (attributes.isSet('lspace') ?
                   Math.max(0, this.length2em(attributes.get('lspace'))) :
                   MathMLSpace(isScript, node.lspace));
    this.bbox.R = (attributes.isSet('rspace') ?
                   Math.max(0, this.length2em(attributes.get('rspace'))) :
                   MathMLSpace(isScript, node.rspace));
  }

  /**
   * Get the spacing using the TeX rules
   *
   * @parm {boolean} isTop       True when this is a top-level embellished operator
   * @parm {boolean} hasSpacing  True when there is an explicit or inherited 'form' attribute
   */
   getTeXSpacing(isTop, hasSpacing) {
    if (!hasSpacing) {
      const space = this.node.texSpacing();
      if (space) {
        this.bbox.L = this.length2em(space);
      }
    }
    if (isTop || hasSpacing) {
      const attributes = this.node.coreMO().attributes;
      if (attributes.isSet('lspace')) {
        this.bbox.L = Math.max(0, this.length2em(attributes.get('lspace')));
      }
      if (attributes.isSet('rspace')) {
        this.bbox.R = Math.max(0, this.length2em(attributes.get('rspace')));
      }
    }
  }

  /**
   * @return {boolean}   True if this is the top-most container of an embellished operator that is
   *                       itself an embellished operator (the maximal embellished operator for its core)
   */
   isTopEmbellished() {
    return (this.node.isEmbellished &&
            !(this.node.Parent && this.node.Parent.isEmbellished));
  }

  /*******************************************************************/

  /**
   * @return {CommonWrapper}  The wrapper for this node's core node
   */
   core() {
    return this.jax.nodeMap.get(this.node.core());
  }

  /**
   * @return {CommonWrapper}  The wrapper for this node's core <mo> node
   */
   coreMO() {
    return this.jax.nodeMap.get(this.node.coreMO());
  }

  /**
   * @return {string}  For a token node, the combined text content of the node's children
   */
   getText() {
    let text = '';
    if (this.node.isToken) {
      for (const child of this.node.childNodes) {
        if (child instanceof TextNode) {
          text += child.getText();
        }
      }
    }
    return text;
  }

  /**
   * @param {DIRECTION} direction  The direction to stretch this node
   * @return {boolean}             Whether the node can stretch in that direction
   */
   canStretch(direction) {
    this.stretch = NOSTRETCH ;
    if (this.node.isEmbellished) {
      let core = this.core();
      if (core && core.node !== this.node) {
        if (core.canStretch(direction)) {
          this.stretch = core.stretch;
        }
      }
    }
    return this.stretch.dir !== DIRECTION.None;
  }

  /**
   * @return {[string, number]}  The alignment and indentation shift for the expression
   */
   getAlignShift() {
    let {indentalign, indentshift, indentalignfirst, indentshiftfirst} =
      this.node.attributes.getList(...indentAttributes) ;
    if (indentalignfirst !== 'indentalign') {
      indentalign = indentalignfirst;
    }
    if (indentalign === 'auto') {
      indentalign = this.jax.options.displayAlign;
    }
    if (indentshiftfirst !== 'indentshift') {
      indentshift = indentshiftfirst;
    }
    if (indentshift === 'auto') {
      indentshift = this.jax.options.displayIndent;
      if (indentalign === 'right' && !indentshift.match(/^\s*0[a-z]*\s*$/)) {
        indentshift = ('-' + indentshift.trim()).replace(/^--/, '');
      }
    }
    const shift = this.length2em(indentshift, this.metrics.containerWidth);
    return [indentalign, shift] ;
  }

  /**
   * @param {number} W       The total width
   * @param {BBox} bbox      The bbox to be aligned
   * @param {string} align   How to align (left, center, right)
   * @return {number}        The x position of the aligned width
   */
   getAlignX(W, bbox, align) {
    return (align === 'right' ? W - (bbox.w + bbox.R) * bbox.rscale :
            align === 'left' ? bbox.L * bbox.rscale :
            (W - bbox.w * bbox.rscale) / 2);
  }

  /**
   * @param {number} H        The total height
   * @param {number} D        The total depth
   * @param {number} h        The height to be aligned
   * @param {number} d        The depth to be aligned
   * @param {string} align    How to align (top, bottom, middle, axis, baseline)
   * @return {number}         The y position of the aligned baseline
   */
   getAlignY(H, D, h, d, align) {
    return (align === 'top' ? H - h :
            align === 'bottom' ? d - D :
            align === 'middle' ? ((H - h) - (D - d)) / 2 :
            0); // baseline and axis
  }

  /**
   * @param {number} i   The index of the child element whose container is needed
   * @return {number}    The inner width as a container (for percentage widths)
   */
   getWrapWidth(i) {
    return this.childNodes[i].getBBox().w;
  }

  /**
   * @param {number} i   The index of the child element whose container is needed
   * @return {string}    The alignment child element
   */
   getChildAlign(_i) {
    return 'left';
  }

  /*******************************************************************/
  /*
   * Easy access to some utility routines
   */

  /**
   * @param {number} m  A number to be shown as a percent
   * @return {string}  The number m as a percent
   */
   percent(m) {
    return percent(m);
  }

  /**
   * @param {number} m  A number to be shown in ems
   * @return {string}  The number with units of ems
   */
   em(m) {
    return em(m);
  }

  /**
   * @param {number} m   A number of em's to be shown as pixels
   * @param {number} M   The minimum number of pixels to allow
   * @return {string}  The number with units of px
   */
   px(m, M = -BIGDIMEN) {
    return px(m, M, this.metrics.em);
  }

  /**
   * @param {Property} length  A dimension (giving number and units) or number to be converted to ems
   * @param {number} size  The default size of the dimension (for percentage values)
   * @param {number} scale  The current scaling factor (to handle absolute units)
   * @return {number}  The dimension converted to ems
   */
   length2em(length, size = 1, scale = null) {
    if (scale === null) {
      scale = this.bbox.scale;
    }
    return length2em(length , size, scale, this.jax.pxPerEm);
  }

  /**
   * @param {string} text   The text to turn into unicode locations
   * @param {string} name   The name of the variant for the characters
   * @return {number[]}     Array of numbers represeting the string's unicode character positions
   */
   unicodeChars(text, name = this.variant) {
    let chars = unicodeChars(text);
    //
    //  Remap to Math Alphanumerics block
    //
    const variant = this.font.getVariant(name);
    if (variant && variant.chars) {
      const map = variant.chars;
      //
      //  Is map[n] doesn't exist, (map[n] || []) still gives an CharData array.
      //  If the array doesn't have a CharOptions element use {} instead.
      //  Then check if the options has an smp property, which gives
      //    the Math Alphabet mapping for this characger.
      //  Otherwise use the original code point, n.
      //
      chars = chars.map((n) => ((map[n] || [])[3] || {}).smp || n);
    }
    return chars;
  }

  /**
   * @param {number[]} chars    The array of unicode character numbers to remap
   * @return {number[]}         The converted array
   */
   remapChars(chars) {
    return chars;
  }

  /**
   * @param {string} text   The text from which to create a TextNode object
   * @return {TextNode}     The TextNode with the given text
   */
   mmlText(text) {
    return ((this.node ).factory.create('text') ).setText(text);
  }

  /**
   * @param {string} kind             The kind of MmlNode to create
   * @param {ProperyList} properties  The properties to set initially
   * @param {MmlNode[]} children      The child nodes to add to the created node
   * @return {MmlNode}                The newly created MmlNode
   */
   mmlNode(kind, properties = {}, children = []) {
    return (this.node ).factory.create(kind, properties, children);
  }

  /**
   * Create an mo wrapper with the given text,
   *   link it in, and give it the right defaults.
   *
   * @param {string} text     The text for the wrapped element
   * @return {CommonWrapper}  The wrapped MmlMo node
   */
   createMo(text) {
    const mmlFactory = (this.node ).factory;
    const textNode = (mmlFactory.create('text') ).setText(text);
    const mml = mmlFactory.create('mo', {stretchy: true}, [textNode]);
    mml.inheritAttributesFrom(this.node);
    const node = this.wrap(mml);
    node.parent = this ;
    return node;
  }

  /**
   * @param {string} variant   The variant in which to look for the character
   * @param {number} n         The number of the character to look up
   * @return {CharData}        The full CharData object, with CharOptions guaranteed to be defined
   */
   getVariantChar(variant, n) {
    const char = this.font.getChar(variant, n) || [0, 0, 0, {unknown: true} ];
    if (char.length === 3) {
      (char )[3] = {};
    }
    return char ;
  }

} CommonWrapper.__initStatic(); CommonWrapper.__initStatic2(); CommonWrapper.__initStatic3(); CommonWrapper.__initStatic4(); CommonWrapper.__initStatic5(); CommonWrapper.__initStatic6();

/*****************************************************************/

/**
 * Some standard sizes to use in predefind CSS properties
 */
const FONTSIZE = {
  '70.7%': 's',
  '70%': 's',
  '50%': 'ss',
  '60%': 'Tn',
  '85%': 'sm',
  '120%': 'lg',
  '144%': 'Lg',
  '173%': 'LG',
  '207%': 'hg',
  '249%': 'HG'
};

const SPACE = {
  /* tslint:disable:whitespace */
  [em(2/18)]: '1',
  [em(3/18)]: '2',
  [em(4/18)]: '3',
  [em(5/18)]: '4',
  [em(6/18)]: '5'
  /* tslint:enable */
};


/**
 * Shorthand for making a CHTMLWrapper constructor
 */

























/*****************************************************************/
/**
 *  The base CHTMLWrapper class
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLWrapper extends
CommonWrapper






 {constructor(...args) { super(...args); CHTMLWrapper.prototype.__init.call(this); }

  /**
   * The wrapper type
   */
   static __initStatic() {this.kind = 'unknown';}

  /**
   * If true, this causes a style for the node type to be generated automatically
   * that sets display:inline-block (as needed for the output for MmlNodes).
   */
   static __initStatic2() {this.autoStyle = true;}

  /**
   * True when an instance of this class has been typeset
   * (used to control whether the styles for this class need to be output)
   */
   static __initStatic3() {this.used = false;}

  /**
   * @override
   */
  

  /**
   * @override
   */
  
  /**
   * @override
   */
  

  /**
   * The HTML element generated for this wrapped node
   */
   __init() {this.chtml = null;}

  /*******************************************************************/

  /**
   * Create the HTML for the wrapped node.
   *
   * @param {N} parent  The HTML node where the output is added
   */
   toCHTML(parent) {
    const chtml = this.standardCHTMLnode(parent);
    for (const child of this.childNodes) {
      child.toCHTML(chtml);
    }
  }

  /*******************************************************************/

  /**
   * Create the standard CHTML element for the given wrapped node.
   *
   * @param {N} parent  The HTML element in which the node is to be created
   * @returns {N}  The root of the HTML tree for the wrapped node's output
   */
   standardCHTMLnode(parent) {
    this.markUsed();
    const chtml = this.createCHTMLnode(parent);
    this.handleStyles();
    this.handleVariant();
    this.handleScale();
    this.handleColor();
    this.handleSpace();
    this.handleAttributes();
    this.handlePWidth();
    return chtml;
  }

  /**
   * Mark this class as having been typeset (so its styles will be output)
   */
   markUsed() {
    (this.constructor ).used = true;
  }

  /**
   * @param {N} parent  The HTML element in which the node is to be created
   * @returns {N}  The root of the HTML tree for the wrapped node's output
   */
   createCHTMLnode(parent) {
    const href = this.node.attributes.get('href');
    if (href) {
      parent = this.adaptor.append(parent, this.html('a', {href: href})) ;
    }
    this.chtml = this.adaptor.append(parent, this.html('mjx-' + this.node.kind)) ;
    return this.chtml;
  }

  /**
   * Set the CSS styles for the chtml element
   */
   handleStyles() {
    if (!this.styles) return;
    const styles = this.styles.cssText;
    if (styles) {
      this.adaptor.setAttribute(this.chtml, 'style', styles);
      const family = this.styles.get('font-family');
      if (family) {
        this.adaptor.setStyle(this.chtml, 'font-family', 'MJXZERO, ' + family);
      }
    }
  }

  /**
   * Set the CSS for the math variant
   */
   handleVariant() {
    if (this.node.isToken && this.variant !== '-explicitFont') {
      this.adaptor.setAttribute(this.chtml, 'class',
                                (this.font.getVariant(this.variant) || this.font.getVariant('normal')).classes);
    }
  }

  /**
   * Set the (relative) scaling factor for the node
   */
   handleScale() {
    this.setScale(this.chtml, this.bbox.rscale);
  }

  /**
   * @param {N} chtml  The HTML node to scale
   * @param {number} rscale      The relatie scale to apply
   * @return {N}       The HTML node (for chaining)
   */
   setScale(chtml, rscale) {
    const scale = (Math.abs(rscale - 1) < .001 ? 1 : rscale);
    if (chtml && scale !== 1) {
      const size = this.percent(scale);
      if (FONTSIZE[size]) {
        this.adaptor.setAttribute(chtml, 'size', FONTSIZE[size]);
      } else {
        this.adaptor.setStyle(chtml, 'fontSize', size);
      }
    }
    return chtml;
  }

  /**
   * Add the proper spacing
   */
   handleSpace() {
    for (const data of [[this.bbox.L, 'space',  'marginLeft'],
                        [this.bbox.R, 'rspace', 'marginRight']]) {
      const [dimen, name, margin] = data ;
      if (dimen) {
        const space = this.em(dimen);
        if (SPACE[space]) {
          this.adaptor.setAttribute(this.chtml, name, SPACE[space]);
        } else {
          this.adaptor.setStyle(this.chtml, margin, space);
        }
      }
    }
  }

  /**
   * Add the foreground and background colors
   * (Only look at explicit attributes, since inherited ones will
   *  be applied to a parent element, and we will inherit from that)
   */
   handleColor() {
    const attributes = this.node.attributes;
    const mathcolor = attributes.getExplicit('mathcolor') ;
    const color = attributes.getExplicit('color') ;
    const mathbackground = attributes.getExplicit('mathbackground') ;
    const background = attributes.getExplicit('background') ;
    if (mathcolor || color) {
      this.adaptor.setStyle(this.chtml, 'color', mathcolor || color);
    }
    if (mathbackground || background) {
      this.adaptor.setStyle(this.chtml, 'backgroundColor', mathbackground || background);
    }
  }

  /**
   * Copy RDFa, aria, and other tags from the MathML to the CHTML output nodes.
   * Don't copy those in the skipAttributes list, or anything that already exists
   * as a property of the node (e.g., no "onlick", etc.).  If a name in the
   * skipAttributes object is set to false, then the attribute WILL be copied.
   * Add the class to any other classes already in use.
   */
   handleAttributes() {
    const attributes = this.node.attributes;
    const defaults = attributes.getAllDefaults();
    const skip = CHTMLWrapper.skipAttributes;
    for (const name of attributes.getExplicitNames()) {
      if (skip[name] === false || (!(name in defaults) && !skip[name] &&
                                   !this.adaptor.hasAttribute(this.chtml, name))) {
        this.adaptor.setAttribute(this.chtml, name, attributes.getExplicit(name) );
      }
    }
    if (attributes.get('class')) {
      const names = (attributes.get('class') ).trim().split(/ +/);
      for (const name of names) {
        this.adaptor.addClass(this.chtml, name);
      }
    }
  }

  /**
   * Handle the attributes needed for percentage widths
   */
   handlePWidth() {
    if (this.bbox.pwidth) {
      if (this.bbox.pwidth === BBox.fullWidth) {
        this.adaptor.setAttribute(this.chtml, 'width', 'full');
      } else {
        this.adaptor.setStyle(this.chtml, 'width', this.bbox.pwidth);
      }
    }
  }

  /*******************************************************************/

  /**
   * @param {N} chtml       The HTML node whose indentation is to be adjusted
   * @param {string} align  The alignment for the node
   * @param {number} shift  The indent (positive or negative) for the node
   */
   setIndent(chtml, align, shift) {
    const adaptor = this.adaptor;
    if (align === 'center' || align === 'left') {
      const L = this.getBBox().L;
      adaptor.setStyle(chtml, 'margin-left', this.em(shift + L));
    }
    if (align === 'center' || align === 'right') {
      const R = this.getBBox().R;
      adaptor.setStyle(chtml, 'margin-right', this.em(-shift + R));
    }
  }

  /*******************************************************************/
  /**
   * For debugging
   */

   drawBBox() {
    let {w, h, d, R}  = this.getBBox();
    const box = this.html('mjx-box', {style: {
      opacity: .25, 'margin-left': this.em(-w - R)
    }}, [
      this.html('mjx-box', {style: {
        height: this.em(h),
        width: this.em(w),
        'background-color': 'red'
      }}),
      this.html('mjx-box', {style: {
        height: this.em(d),
        width: this.em(w),
        'margin-left': this.em(-w),
        'vertical-align': this.em(-d),
        'background-color': 'green'
      }})
    ] );
    const node = this.chtml || this.parent.chtml;
    const size = this.adaptor.getAttribute(node, 'size');
    if (size) {
      this.adaptor.setAttribute(box, 'size', size);
    }
    const fontsize = this.adaptor.getStyle(node, 'fontSize');
    if (fontsize) {
      this.adaptor.setStyle(box, 'fontSize', fontsize);
    }
    this.adaptor.append(this.adaptor.parent(node), box);
    this.adaptor.setStyle(node, 'backgroundColor', '#FFEE00');
  }

  /*******************************************************************/
  /*
   * Easy access to some utility routines
   */

  /**
   * @param {string} type      The tag name of the HTML node to be created
   * @param {OptionList} def   The properties to set for the created node
   * @param {(N|T)[]} content  The child nodes for the created HTML node
   * @return {N}               The generated HTML tree
   */
   html(type, def = {}, content = []) {
    return this.jax.html(type, def, content);
  }

  /**
   * @param {string} text  The text from which to create an HTML text node
   * @return {T}           The generated text node with the given text
   */
   text(text) {
    return this.jax.text(text);
  }

  /**
   * @param {number} n  A unicode code point to be converted to a character className reference.
   * @return {string}   The className for the character
   */
   char(n) {
    return this.font.charSelector(n).substr(1);
  }

} CHTMLWrapper.__initStatic(); CHTMLWrapper.__initStatic2(); CHTMLWrapper.__initStatic3();

/*****************************************************************/
/**
 * The CommonMath interface
 */








/*****************************************************************/
/**
 *  The CommonMath wrapper mixin for the MmlMath object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMathMixin(Base) {

  return class extends Base {

    /**
     * @override
     */
     getWrapWidth(_i) {
      return (this.parent ? this.getBBox().w : this.metrics.containerWidth / this.jax.pxPerEm);
    }

  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 * The CHTMLmath wrapper for the MmlMath object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmath extends
CommonMathMixin(CHTMLWrapper) {

  /**
   * The math wrapper
   */
   static __initStatic() {this.kind = MmlMath.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-math': {
      'line-height': 0,
      'text-align': 'left',
      'text-indent': 0,
      'font-style': 'normal',
      'font-weight': 'normal',
      'font-size': '100%',
      'font-size-adjust': 'none',
      'letter-spacing': 'normal',
      'word-wrap': 'normal',
      'word-spacing': 'normal',
      'white-space': 'nowrap',
      'direction': 'ltr',
      'padding': '1px 0'
    },
    'mjx-container[jax="CHTML"][display="true"]': {
      display: 'block',
      'text-align': 'center',
      margin: '1em 0'
    },
    'mjx-container[jax="CHTML"][display="true"][width="full"]': {
      display: 'flex'
    },
    'mjx-container[jax="CHTML"][display="true"] mjx-math': {
      padding: 0
    },
    'mjx-container[jax="CHTML"][justify="left"]': {
      'text-align': 'left'
    },
    'mjx-container[jax="CHTML"][justify="right"]': {
      'text-align': 'right'
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    super.toCHTML(parent);
    const chtml = this.chtml;
    const adaptor = this.adaptor;
    const display = (this.node.attributes.get('display') === 'block');
    if (display) {
      adaptor.setAttribute(chtml, 'display', 'true');
      adaptor.setAttribute(parent, 'display', 'true');
      this.handleDisplay(parent);
    } else {
      this.handleInline(parent);
    }
    adaptor.addClass(chtml, 'MJX-TEX');
  }

  /**
   *  Handle displayed equations (set min-width, and so on).
   */
   handleDisplay(parent) {
    const adaptor = this.adaptor;
    const [align, shift] = this.getAlignShift();
    if (align !== 'center') {
      adaptor.setAttribute(parent, 'justify', align);
    }
    if (this.bbox.pwidth === BBox.fullWidth) {
      adaptor.setAttribute(parent, 'width', 'full');
      if (this.jax.table) {
        let {L, w, R} = this.jax.table.getBBox();
        if (align === 'right') {
          R = Math.max(R || -shift, -shift);
        } else if (align === 'left') {
          L = Math.max(L || shift, shift);
        } else if (align === 'center') {
          w += 2 * Math.abs(shift);
        }
        const W = this.em(Math.max(0, L + w + R));
        adaptor.setStyle(parent, 'min-width', W);
        adaptor.setStyle(this.jax.table.chtml, 'min-width', W);
      }
    } else {
      this.setIndent(this.chtml, align, shift);
    }
  }

  /**
   * Handle in-line expressions
   */
   handleInline(parent) {
    //
    // Transfer right margin to container (for things like $x\hskip -2em y$)
    //
    const adaptor = this.adaptor;
    const margin = adaptor.getStyle(this.chtml, 'margin-right');
    if (margin) {
      adaptor.setStyle(this.chtml, 'margin-right', '');
      adaptor.setStyle(parent, 'margin-right', margin);
      adaptor.setStyle(parent, 'width', '0');
    }
  }

  /**
   * @override
   */
   setChildPWidths(recompute, w = null, clear = true) {
    return (this.parent ? super.setChildPWidths(recompute, w, clear) : false);
  }

} CHTMLmath.__initStatic(); CHTMLmath.__initStatic2();

var _class;

























/*****************************************************************/
/**
 * The CommonMi interface
 */












/*****************************************************************/
/**
 *  The CommonMi wrapper mixin for the MmlMi object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMiMixin(Base) {

  return (_class = class extends Base {constructor(...args) { super(...args); _class.prototype.__init.call(this); }

    /**
     * True if no italic correction should be used
     */
     __init() {this.noIC = false;}

    /**
     * @override
     */
     computeBBox(bbox, _recompute = false) {
      super.computeBBox(bbox);
      this.copySkewIC(bbox);
      if (this.noIC) {
        bbox.w -= bbox.ic;
      }
    }
  }, _class);

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 *  The CHTMLmi wrapper for the MmlMi object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmi extends
CommonMiMixin(CHTMLWrapper) {

  /**
   * The mi wrapper
   */
   static __initStatic() {this.kind = MmlMi.prototype.kind;}

  /**
   * @override
   */
   toCHTML(parent) {
    super.toCHTML(parent);
    if (this.noIC) {
      this.adaptor.setAttribute(this.chtml, 'noIC', 'true');
    }
  }

} CHTMLmi.__initStatic();

var _class$1;

/*****************************************************************/
/**
 * Convert direction to letter
 */
const DirectionVH = {
  [DIRECTION.Vertical]: 'v',
  [DIRECTION.Horizontal]: 'h'
};

/*****************************************************************/
/**
 * The CommonMo interface
 */



























































/*****************************************************************/
/**
 * The CommomMo wrapper mixin for the MmlMo object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMoMixin(Base) {

  return (_class$1 = class extends Base {

    /**
     * True if no italic correction should be used
     */
     __init() {this.noIC = false;}

    /**
     * The font size that a stretched operator uses.
     * If -1, then stretch arbitrarily, and bbox gives the actual height, depth, width
     */
     __init2() {this.size = null;}

    /**
     * True if used as an accent in an munderover construct
     */
    

    /**
     * @override
     */
    constructor(...args) {
      super(...args);_class$1.prototype.__init.call(this);_class$1.prototype.__init2.call(this);      this.isAccent = (this.node ).isAccent;
    }

    /**
     * @override
     */
     computeBBox(bbox, _recompute = false) {
      const stretchy = (this.stretch.dir !== DIRECTION.None);
      if (stretchy && this.size === null) {
        this.getStretchedVariant([0]);
      }
      if (stretchy && this.size < 0) return;
      super.computeBBox(bbox);
      this.copySkewIC(bbox);
      if (this.noIC) {
        bbox.w -= bbox.ic;
      }
      if (this.node.attributes.get('symmetric') &&
          this.stretch.dir !== DIRECTION.Horizontal) {
        const d = ((bbox.h + bbox.d) / 2 + this.font.params.axis_height) - bbox.h;
        bbox.h += d;
        bbox.d -= d;
      }
    }

    /**
     * @override
     */
     getVariant() {
      if (this.node.attributes.get('largeop')) {
        this.variant = (this.node.attributes.get('displaystyle') ? '-largeop' : '-smallop');
      } else {
        super.getVariant();
      }
    }

    /**
     * @override
     */
     canStretch(direction) {
      if (this.stretch.dir !== DIRECTION.None) {
        return this.stretch.dir === direction;
      }
      const attributes = this.node.attributes;
      if (!attributes.get('stretchy')) return false;
      const c = this.getText();
      if (Array.from(c).length !== 1) return false;
      const delim = this.font.getDelimiter(c.codePointAt(0));
      this.stretch = (delim && delim.dir === direction ? delim : NOSTRETCH);
      return this.stretch.dir !== DIRECTION.None;
    }

    /**
     * Determint variant for vertically/horizontally stretched character
     *
     * @param {number[]} WH  size to stretch to, either [W] or [H, D]
     * @param {boolean} exact  True if not allowed to use delimiter factor and shortfall
     */
     getStretchedVariant(WH, exact = false) {
      if (this.stretch.dir !== DIRECTION.None) {
        let D = this.getWH(WH);
        const min = this.getSize('minsize', 0);
        const max = this.getSize('maxsize', Infinity);
        //
        //  Clamp the dimension to the max and min
        //  then get the minimum size via TeX rules
        //
        D = Math.max(min, Math.min(max, D));
        const m = (min || exact ? D : Math.max(D * this.font.params.delimiterfactor / 1000,
                                               D - this.font.params.delimitershortfall));
        //
        //  Look through the delimiter sizes for one that matches
        //
        const delim = this.stretch;
        const c = delim.c || this.getText().codePointAt(0);
        let i = 0;
        if (delim.sizes) {
          for (const d of delim.sizes) {
            if (d >= m) {
              this.variant = this.font.getSizeVariant(c, i);
              this.size = i;
              return;
            }
            i++;
          }
        }
        //
        //  No size matches, so if we can make multi-character delimiters,
        //  record the data for that, otherwise, use the largest fixed size.
        //
        if (delim.stretch) {
          this.size = -1;
          this.invalidateBBox();
          this.getStretchBBox(WH, D, delim);
        } else {
          this.variant = this.font.getSizeVariant(c, i - 1);
          this.size = i - 1;
        }
      }
    }

    /**
     * @param {string} name   The name of the attribute to get
     * @param {number} value  The default value to use
     * @return {number}       The size in em's of the attribute (or the default value)
     */
     getSize(name, value) {
      let attributes = this.node.attributes;
      if (attributes.isSet(name)) {
        value = this.length2em(attributes.get(name), 1, 1); // FIXME: should use height of actual character
      }
      return value;
    }

    /**
     * @param {number[]} WH  Either [W] for width, [H, D] for height and depth, or [] for min/max size
     * @return {number}      Either the width or the total height of the character
     */
     getWH(WH) {
      if (WH.length === 0) return 0;
      if (WH.length === 1) return WH[0];
      let [H, D] = WH;
      const a = this.font.params.axis_height;
      return (this.node.attributes.get('symmetric') ? 2 * Math.max(H - a, D + a) : H + D);
    }

    /**
     * @param {number[]} WHD     The [W] or [H, D] being requested from the parent mrow
     * @param {number} D         The full dimension (including symmetry, etc)
     * @param {DelimiterData} C  The delimiter data for the stretchy character
     */
     getStretchBBox(WHD, D, C) {
      if (C.hasOwnProperty('min') && C.min > D) {
        D = C.min;
      }
      let [h, d, w] = C.HDW;
      if (this.stretch.dir === DIRECTION.Vertical) {
        [h, d] = this.getBaseline(WHD, D, C);
      } else {
        w = D;
      }
      this.bbox.h = h;
      this.bbox.d = d;
      this.bbox.w = w;
    }

    /**
     * @param {number[]} WHD     The [H, D] being requested from the parent mrow
     * @param {number} HD        The full height (including symmetry, etc)
     * @param {DelimiterData} C  The delimiter data for the stretchy character
     * @return {[number, number]}        The height and depth for the vertically stretched delimiter
     */
     getBaseline(WHD, HD, C) {
      const hasWHD = (WHD.length === 2 && WHD[0] + WHD[1] === HD);
      const symmetric = this.node.attributes.get('symmetric');
      const [H, D] = (hasWHD ? WHD : [HD, 0]);
      let [h, d] = [H + D, 0];
      if (symmetric) {
        //
        //  Center on the math axis
        //
        const a = this.font.params.axis_height;
        if (hasWHD) {
          h = 2 * Math.max(H - a, D + a);
        }
        d = h / 2 - a;
      } else if (hasWHD) {
        //
        //  Use the given depth (from mrow)
        //
        d = D;
      } else {
        //
        //  Use depth proportional to the normal-size character
        //  (when stretching for minsize or maxsize by itself)
        //
        let [ch, cd] = (C.HDW || [.75, .25]);
        d = cd * (h / (ch + cd));
      }
      return [h - d, d];
    }

    /**
     * @override
     */
     remapChars(chars) {
      if (chars.length === 1) {
        const parent = (this.node ).coreParent().parent;
        const isAccent = this.isAccent && !parent.isKind('mrow');
        const map = (isAccent ? 'accent' : 'mo');
        const text = this.font.getRemappedChar(map, chars[0]);
        if (text) {
          chars = this.unicodeChars(text, this.variant);
        }
      }
      return chars;
    }

  }, _class$1);

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/****************************************************************************/

/**
 * Add the extra data needed for CharOptions in CHTML
 */



























/****************************************************************************/

/**
 * The CHTML FontData class
 */
class CHTMLFontData extends FontData {
  /**
   * Default options
   */
   static __initStatic() {this.OPTIONS = {
    fontURL: 'js/output/chtml/fonts/tex-woff-v2'
  };}

  /**
   * The default class names to use for each variant
   */
   static __initStatic2() {this.defaultVariantClasses = {};}

  /**
   * The default font letter to use for each variant
   */
   static __initStatic3() {this.defaultVariantLetters = {};}

  /**
   * The CSS styles needed for this font.
   */
   static __initStatic4() {this.defaultStyles = {
    'mjx-c::before': {
      display: 'block',
      width: 0
    }
  };}

  /**
   * The default @font-face declarations with %%URL%% where the font path should go
   */
   static __initStatic5() {this.defaultFonts = {
    '@font-face /* 0 */': {
      'font-family': 'MJXZERO',
      src: 'url("%%URL%%/MathJax_Zero.woff") format("woff")'
    }
  };}

  /**
   * The font options
   */
  

  /**
   * @override
   */
   static charOptions(font, n) {
    return super.charOptions(font, n) ;
  }

  /***********************************************************************/

  /**
   * @param {OptionList} options   The options for this font
   *
   * @override
   * @constructor
   */
  constructor(options = null) {
    super();
    let CLASS = (this.constructor );
    this.options = userOptions(defaultOptions({}, CLASS.OPTIONS), options);
  }

  /**
   * @param {boolean} adapt   Whether to use adaptive CSS or not
   */
   adaptiveCSS(adapt) {
    this.options.adaptiveCSS = adapt;
  }

  /**
   * Clear the cache of which characters have been used
   */
   clearCache() {
    if (!this.options.adaptiveCSS) return;
    //
    // Clear delimiter usage
    //
    for (const n of Object.keys(this.delimiters)) {
      this.delimiters[parseInt(n)].used = false;
    }
    //
    // Clear the character usage
    //
    for (const name of Object.keys(this.variant)) {
      const chars = this.variant[name].chars;
      for (const n of Object.keys(chars)) {
        const options = chars[parseInt(n)][3] ;
        if (options) {
          options.used = false;
        }
      }
    }
  }

  /**
   * @override
   */
   createVariant(name, inherit = null, link = null) {
    super.createVariant(name, inherit, link);
    let CLASS = (this.constructor );
    this.variant[name].classes = CLASS.defaultVariantClasses[name];
    this.variant[name].letter = CLASS.defaultVariantLetters[name];
  }

  /**
   * @override
   */
   defineChars(name, chars) {
    super.defineChars(name, chars);
    const letter = this.variant[name].letter;
    for (const n of Object.keys(chars)) {
      const options = CHTMLFontData.charOptions(chars, parseInt(n));
      if (options.f === undefined) {
        options.f = letter;
      }
    }
  }

  /***********************************************************************/

  /**
   * @return {StyleList}  The (computed) styles for this font
   */
  get styles() {
    const CLASS = this.constructor ;
    //
    //  Include the default styles
    //
    let styles = {...CLASS.defaultStyles};
    //
    //  Add fonts with proper URL
    //
    this.addFontURLs(styles, CLASS.defaultFonts, this.options.fontURL);
    //
    //  Create styles needed for the delimiters
    //
    for (const n of Object.keys(this.delimiters)) {
      const N = parseInt(n);
      this.addDelimiterStyles(styles, N, this.delimiters[N]);
    }
    //
    //  Create styles needed for the characters in each variant
    //
    this.addVariantChars(styles);
    //
    //  Return the final style sheet
    //
    return styles;
  }

  /**
   * @param {StyleList} styles  The style list to add characters to
   */
   addVariantChars(styles) {
    const allCSS = !this.options.adaptiveCSS;
    for (const name of Object.keys(this.variant)) {
      const variant = this.variant[name];
      const vletter = variant.letter;
      for (const n of Object.keys(variant.chars)) {
        const N = parseInt(n);
        const char = variant.chars[N];
        if ((char[3] || {}).smp) continue;
        if (allCSS && char.length < 4) {
          (char )[3] = {};
        }
        if (char.length === 4 || allCSS) {
          this.addCharStyles(styles, vletter, N, char);
        }
      }
    }
  }

  /**
   * @param {StyleList} styles    The style object to add styles to
   * @param {StyleList} fonts     The default font-face directives with %%URL%% where the url should go
   * @param {string} url          The actual URL to insert into the src strings
   */
   addFontURLs(styles, fonts, url) {
    for (const name of Object.keys(fonts)) {
      const font = {...fonts[name]};
      font.src = (font.src ).replace(/%%URL%%/, url);
      styles[name] = font;
    }
  }

  /*******************************************************/

  /**
   * @param {StyleList} styles         The style object to add styles to
   * @param {number} n                 The unicode character number of the delimiter
   * @param {CHTMLDelimiterData} data  The data for the delimiter whose CSS is to be added
   */
   addDelimiterStyles(styles, n, data) {
    if (this.options.adaptiveCSS && !data.used) return;
    const c = this.charSelector(n);
    if (data.c && data.c !== n) {
      styles['.mjx-stretched mjx-c' + c + '::before'] = {
        content: this.charContent(data.c)
      };
    }
    if (!data.stretch) return;
    if (data.dir === DIRECTION.Vertical) {
      this.addDelimiterVStyles(styles, c, data);
    } else {
      this.addDelimiterHStyles(styles, c, data);
    }
  }

  /*******************************************************/

  /**
   * @param {StyleList} styles         The style object to add styles to
   * @param {string} c                 The delimiter character string
   * @param {CHTMLDelimiterData} data  The data for the delimiter whose CSS is to be added
   */
   addDelimiterVStyles(styles, c, data) {
    const W = data.HDW[2];
    const [beg, ext, end, mid] = data.stretch;
    const Hb = this.addDelimiterVPart(styles, c, W, 'beg', beg);
    this.addDelimiterVPart(styles, c, W, 'ext', ext);
    const He = this.addDelimiterVPart(styles, c, W, 'end', end);
    const css = {};
    if (mid) {
      const Hm = this.addDelimiterVPart(styles, c, W, 'mid', mid);
      css.height = '50%';
      styles['mjx-stretchy-v' + c + ' > mjx-mid'] = {
        'margin-top': this.em(-Hm / 2),
        'margin-bottom': this.em(-Hm / 2)
      };
    }
    if (Hb) {
      css['border-top-width'] = this.em0(Hb - .03);
    }
    if (He) {
      css['border-bottom-width'] = this.em0(He - .03);
      styles['mjx-stretchy-v' + c + ' > mjx-end'] = {'margin-top': this.em(-He)};
    }
    if (Object.keys(css).length) {
      styles['mjx-stretchy-v' + c + ' > mjx-ext'] = css;
    }
  }

  /**
   * @param {StyleList} styles  The style object to add styles to
   * @param {string} c          The vertical character whose part is being added
   * @param {number} W          The width for the stretchy delimiter as a whole
   * @param {string} part       The name of the part (beg, ext, end, mid) that is being added
   * @param {number} n          The unicode character to use for the part
   * @return {number}           The total height of the character
   */
   addDelimiterVPart(styles, c, W, part, n) {
    if (!n) return 0;
    const data = this.getDelimiterData(n);
    const dw = (W - data[2]) / 2;
    const css = {content: this.charContent(n)};
    if (part !== 'ext') {
      css.padding = this.padding(data, dw);
    } else if (dw) {
      css['padding-left'] = this.em0(dw);
    }
    styles['mjx-stretchy-v' + c + ' mjx-' + part + ' mjx-c::before'] = css;
    return data[0] + data[1];
  }

  /*******************************************************/

  /**
   * @param {StyleList} styles         The style object to add styles to
   * @param {string} c                 The delimiter character string
   * @param {CHTMLDelimiterData} data  The data for the delimiter whose CSS is to be added
   */
   addDelimiterHStyles(styles, c, data) {
    const [beg, ext, end, mid] = data.stretch;
    this.addDelimiterHPart(styles, c, 'beg', beg);
    this.addDelimiterHPart(styles, c, 'ext', ext, !(beg || end));
    this.addDelimiterHPart(styles, c, 'end', end);
    if (mid) {
      this.addDelimiterHPart(styles, c, 'mid', mid);
      styles['mjx-stretchy-h' + c + ' > mjx-ext'] = {width: '50%'};
    }
  }

  /**
   * @param {StyleList} styles  The style object to add styles to
   * @param {string} c          The vertical character whose part is being added
   * @param {string} part       The name of the part (beg, ext, end, mid) that is being added
   * @param {number} n          The unicode character to use for the part
   * @param {boolean} force     True if padding is always enforced
   */
   addDelimiterHPart(styles, c, part, n, force = false) {
    if (!n) return;
    const data = this.getDelimiterData(n);
    const options = data[3] ;
    const css = {content: (options && options.c ? '"' + options.c + '"' : this.charContent(n))};
    if (part !== 'ext' || force) {
      css.padding = this.padding(data, 0, -data[2]);
    }
    styles['mjx-stretchy-h' + c + ' mjx-' + part + ' mjx-c::before'] = css;
  }

  /*******************************************************/

  /**
   * @param {StyleList} styles  The style object to add styles to
   * @param {string} vletter    The variant class letter (e.g., `B`, `SS`) where this character is being defined
   * @param {number} n          The unicode character being defined
   * @param {CHTMLCharData} data     The bounding box data and options for the character
   */
   addCharStyles(styles, vletter, n, data) {
    const [ , , w, options] = data ;
    if (this.options.adaptiveCSS && !options.used) return;
    const letter = (options.f !== undefined ? options.f : vletter);
    const selector = 'mjx-c' + this.charSelector(n) + (letter ? '.TEX-' + letter : '');
    styles[selector + '::before'] = {
      padding: this.padding(data, 0, options.ic || 0),
      content: (options.c != null ? '"' + options.c + '"' : this.charContent(n))
    };
    if (options.ic) {
      styles['[noIC] ' + selector + ':last-child::before'] = {
        'padding-right': this.em(w)
      };
    }
  }

  /***********************************************************************/

  /**
   * @param {number} n         The character number to find
   * @return {CHTMLCharData}   The data for that character to be used for stretchy delimiters
   */
   getDelimiterData(n) {
    return this.getChar('-smallop', n);
  }

  /**
   * @param {number} n  The number of ems
   * @return {string}   The string representing the number with units of "em"
   */
   em(n) {
    return em(n);
  }

  /**
   * @param {number} n  The number of ems (will be restricted to non-negative values)
   * @return {string}   The string representing the number with units of "em"
   */
   em0(n) {
    return em(Math.max(0, n));
  }

  /**
   * @param {CHTMLCharData} data   The [h, d, w] data for the character
   * @param {number} dw            The (optional) left offset of the glyph
   * @param {number} ic            The (optional) italic correction value
   * @return {string}              The padding string for the h, d, w.
   */
   padding([h, d, w], dw = 0, ic = 0) {
    return [h, w + ic, d, dw].map(this.em0).join(' ');
  }

  /**
   * @param {number} n  A unicode code point to be converted to character content for use with the
   *                    CSS rules for fonts (either a literal character for most ASCII values, or \nnnn
   *                    for higher values, or for the double quote and backslash characters).
   * @return {string}   The character as a properly encoded string in quotes.
   */
   charContent(n) {
    return '"' + (n >= 0x20 && n <= 0x7E && n !== 0x22 && n !== 0x27 && n !== 0x5C ?
                  String.fromCharCode(n) : '\\' + n.toString(16).toUpperCase()) + '"';
  }

  /**
   * @param {number} n  A unicode code point to be converted to a selector for use with the
   *                    CSS rules for fonts
   * @return {string}   The character as a selector value.
   */
   charSelector(n) {
    return '.mjx-c' + n.toString(16).toUpperCase();
  }

} CHTMLFontData.__initStatic(); CHTMLFontData.__initStatic2(); CHTMLFontData.__initStatic3(); CHTMLFontData.__initStatic4(); CHTMLFontData.__initStatic5();

/**
 * The CHTMLFontData constructor class
 */










/**
 * @param {CHTMLCharMap} font        The font to augment
 * @param {CharOptionsMap} options   Any additional options for characters in the font
 * @return {CHTMLCharMap}            The augmented font
 */
function AddCSS(font, options) {
  for (const c of Object.keys(options)) {
    const n = parseInt(c);
    Object.assign(FontData.charOptions(font, n), options[n]);
  }
  return font;
}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 * The CHTMLmo wrapper for the MmlMo object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmo extends
CommonMoMixin(CHTMLWrapper) {

  /**
   * The mo wrapper
   */
   static __initStatic() {this.kind = MmlMo.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-stretchy-h': {
      display: 'inline-table',
      width: '100%'
    },
    'mjx-stretchy-h > *': {
      display: 'table-cell',
      width: 0
    },
    'mjx-stretchy-h > * > mjx-c': {
      display: 'inline-block',
      transform: 'scalex(1.0000001)'        // improves blink positioning
    },
    'mjx-stretchy-h > * > mjx-c::before': {
      display: 'inline-block',
      padding: '.001em 0',                  // for blink
      width: 'initial'
    },
    'mjx-stretchy-h > mjx-ext': {
      overflow: 'hidden',
      width: '100%'
    },
    'mjx-stretchy-h > mjx-ext > mjx-c::before': {
      transform: 'scalex(500)'
    },
    'mjx-stretchy-h > mjx-ext > mjx-c': {
      width: 0
    },
    'mjx-stretchy-h > mjx-beg > mjx-c': {
      'margin-right': '-.1em'
    },
    'mjx-stretchy-h > mjx-end > mjx-c': {
      'margin-left': '-.1em'
    },

    'mjx-stretchy-v': {
      display: 'inline-block'
    },
    'mjx-stretchy-v > *': {
      display: 'block'
    },
    'mjx-stretchy-v > mjx-beg': {
      height: 0
    },
    'mjx-stretchy-v > mjx-end > mjx-c': {
      display: 'block'
    },
    'mjx-stretchy-v > * > mjx-c': {
      transform: 'scaley(1.0000001)',       // improves Firefox and blink positioning
      'transform-origin': 'left center',
      overflow: 'hidden'
    },
    'mjx-stretchy-v > mjx-ext': {
      display: 'block',
      height: '100%',
      'box-sizing': 'border-box',
      border: '0px solid transparent',
      overflow: 'hidden'
    },
    'mjx-stretchy-v > mjx-ext > mjx-c::before': {
      width: 'initial'
    },
    'mjx-stretchy-v > mjx-ext > mjx-c': {
      transform: 'scaleY(500) translateY(.1em)',
      overflow: 'visible'
    },
    'mjx-mark': {
      display: 'inline-block',
      height: '0px'
    }

  };}

  /**
   * @override
   */
   toCHTML(parent) {
    const attributes = this.node.attributes;
    const symmetric = (attributes.get('symmetric') ) && this.stretch.dir !== DIRECTION.Horizontal;
    const stretchy = this.stretch.dir !== DIRECTION.None;
    if (stretchy && this.size === null) {
      this.getStretchedVariant([]);
    }
    let chtml = this.standardCHTMLnode(parent);
    if (this.noIC) {
      this.adaptor.setAttribute(chtml, 'noIC', 'true');
    }
    if (stretchy && this.size < 0) {
      this.stretchHTML(chtml);
    } else {
      if (symmetric || attributes.get('largeop')) {
        const bbox = BBox.empty();
        super.computeBBox(bbox);
        const u = this.em((bbox.d - bbox.h) / 2 + this.font.params.axis_height);
        if (u !== '0') {
          this.adaptor.setStyle(chtml, 'verticalAlign', u);
        }
      }
      for (const child of this.childNodes) {
        child.toCHTML(chtml);
      }
    }
  }

  /**
   * Create the HTML for a multi-character stretchy delimiter
   *
   * @param {N} chtml  The parent element in which to put the delimiter
   */
   stretchHTML(chtml) {
    const c = this.getText().codePointAt(0);
    const delim = this.stretch;
    delim.used = true;
    const stretch = delim.stretch;
    const content = [];
    //
    //  Set up the beginning, extension, and end pieces
    //
    if (stretch[0]) {
      content.push(this.html('mjx-beg', {}, [this.html('mjx-c')]));
    }
    content.push(this.html('mjx-ext', {}, [this.html('mjx-c')]));
    if (stretch.length === 4) {
      //
      //  Braces have a middle and second extensible piece
      //
      content.push(
        this.html('mjx-mid', {}, [this.html('mjx-c')]),
        this.html('mjx-ext', {}, [this.html('mjx-c')])
      );
    }
    if (stretch[2]) {
      content.push(this.html('mjx-end', {}, [this.html('mjx-c')]));
    }
    //
    //  Set the styles needed
    //
    const styles = {};
    const {h, d, w} = this.bbox;
    if (delim.dir === DIRECTION.Vertical) {
      //
      //  Vertical needs an extra (empty) element to get vertical position right
      //  in some browsers (e.g., Safari)
      //
      content.push(this.html('mjx-mark'));
      styles.height = this.em(h + d);
      styles.verticalAlign = this.em(-d);
    } else {
      styles.width = this.em(w);
    }
    //
    //  Make the main element and add it to the parent
    //
    const dir = DirectionVH[delim.dir];
    const properties = {class: this.char(delim.c || c), style: styles};
    const html = this.html('mjx-stretchy-' + dir, properties, content);
    this.adaptor.append(chtml, html);
  }

} CHTMLmo.__initStatic(); CHTMLmo.__initStatic2();

/*****************************************************************/
/**
 * The CommonMn interface
 */








/*****************************************************************/
/**
 * The CommonMn wrapper mixin for the MmlMn object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMnMixin(Base) {

  return class extends Base {

    /**
     * @override
     */
     remapChars(chars) {
      //
      //  Convert a leading hyphen to a minus
      //
      if (chars.length) {
        const text = this.font.getRemappedChar('mn', chars[0]);
        if (text) {
          const c = this.unicodeChars(text, this.variant);
          if (c.length === 1) {
            chars[0] = c[0];
          } else {
            chars = c.concat(chars.slice(1));
          }
        }
      }
      return chars;
    }
  };

}

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 * The CHTMLmn wrapper for the MmlMn object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmn extends
CommonMnMixin(CHTMLWrapper) {

  /**
   * The mn wrapper
   */
   static __initStatic() {this.kind = MmlMn.prototype.kind;}

} CHTMLmn.__initStatic();

/*****************************************************************/
/**
 * The CommonMs interface
 */















/*****************************************************************/
/**
 * The CommonMs wrapper mixin for the MmlMs object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMsMixin(Base) {

  return class extends Base {

    /**
     * Add the quote characters to the wrapper children so they will be output
     *
     * @override
     */
    constructor(...args) {
      super(...args);
      const attributes = this.node.attributes;
      let quotes = attributes.getList('lquote', 'rquote');
      if (this.variant !== 'monospace') {
        if (!attributes.isSet('lquote') && quotes.lquote === '"') quotes.lquote = '\u201C';
        if (!attributes.isSet('rquote') && quotes.rquote === '"') quotes.rquote = '\u201D';
      }
      this.childNodes.unshift(this.createText(quotes.lquote ));
      this.childNodes.push(this.createText(quotes.rquote ));
    }

    /**
     * Create a text wrapper with the given text;
     *
     * @param {string} text   The text for the wrapped element
     * @return {AnyWrapper}   The wrapped text node
     */
     createText(text) {
      const node = this.wrap(this.mmlText(text));
      node.parent = this;
      return node;
    }
  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 * The CHTMLms wrapper for the MmlMs object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLms extends
CommonMsMixin(CHTMLWrapper) {

  /**
   * The ms wrapper
   */
   static __initStatic() {this.kind = MmlMs.prototype.kind;}

} CHTMLms.__initStatic();

var _class$2;
























/*****************************************************************/
/**
 * The CommonMtext interface
 */








/*****************************************************************/
/**
 *  The CommonMtext wrapper mixin for the MmlMtext object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMtextMixin(Base) {

  return (_class$2 = class extends Base {

    /**
     * The font-family, weight, and style to use for the variants when mtextInheritFont
     * is true or mtextFont is specified.  If not in this list, then the font's
     * getCssFont() is called.  When the font family is not specified (as in these four),
     * the inherited or specified font is used.
     */
     static __initStatic() {this.INHERITFONTS = {
      normal: ['', false, false],
      bold: ['', false, true],
      italic: ['', true, false],
      'bold-italic': ['', true, true]
    };}

    /**
     * @override
     */
     getVariant() {
      const options = this.jax.options;
      const data = this.jax.math.outputData;
      //
      //  If the font is to be inherited from the surrounding text, check the mathvariant
      //  and see if it allows for inheritance. If so, set the variant appropriately,
      //  otherwise get the usual variant.
      //
      const merror = ((!!data.merrorFamily || !!options.merrorFont) && this.node.Parent.isKind('merror'));
      if (!!data.mtextFamily || !!options.mtextFont || merror) {
        const variant = this.node.attributes.get('mathvariant') ;
        const font = (this.constructor ).INHERITFONTS[variant] || this.jax.font.getCssFont(variant);
        const family = font[0] || (merror ? data.merrorFamily || options.merrorFont :
                                            data.mtextFamily || options.mtextFont);
        this.variant = this.explicitVariant(family, font[2] ? 'bold' : '', font[1] ? 'italic' : '');
        return;
      }
      super.getVariant();
    }

  }, _class$2.__initStatic(), _class$2);

}

/*************************************************************
 *
 *  Copyright (c) 2019 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 * The CHTMLmtext wrapper for the MmlMtext object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmtext extends
CommonMtextMixin(CHTMLWrapper) {

  /**
   * The mtext wrapper
   */
   static __initStatic() {this.kind = MmlMtext.prototype.kind;}

} CHTMLmtext.__initStatic();

/*****************************************************************/
/**
 * The CommonMspance interface
 */








/*****************************************************************/
/**
 * The CommonMspace wrapper mixin for the MmlMspace object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMspaceMixin(Base) {

  return class extends Base {

    /**
     * @override
     */
     computeBBox(bbox, _recompute = false) {
      const attributes = this.node.attributes;
      bbox.w = this.length2em(attributes.get('width'), 0);
      bbox.h = this.length2em(attributes.get('height'), 0);
      bbox.d = this.length2em(attributes.get('depth'), 0);
    }

    /**
     * No contents, so no need for variant class
     *
     * @override
     */
     handleVariant() {
    }

  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 * The CHTMLmspace wrapper for the MmlMspace object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmspace extends
CommonMspaceMixin(CHTMLWrapper) {

  /**
   * The mspace wrapper
   */
   static __initStatic() {this.kind = MmlMspace.prototype.kind;}

  /**
   * @override
   */
   toCHTML(parent) {
    let chtml = this.standardCHTMLnode(parent);
    let {w, h, d} = this.getBBox();
    if (w < 0) {
      this.adaptor.setStyle(chtml, 'marginRight', this.em(w));
      w = 0;
    }
    if (w) {
      this.adaptor.setStyle(chtml, 'width', this.em(w));
    }
    h = Math.max(0, h + d);
    if (h) {
      this.adaptor.setStyle(chtml, 'height', this.em(Math.max(0, h)));
    }
    if (d) {
      this.adaptor.setStyle(chtml, 'verticalAlign', this.em(-d));
    }
  }

} CHTMLmspace.__initStatic();

/*****************************************************************/
/**
 * The CommonMpadded interface
 */




























/*****************************************************************/
/**
 * The CommomMpadded wrapper for the MmlMpadded object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMpaddedMixin(Base) {

  return class extends Base {

    /**
     * Get the content bounding box, and the change in size and offsets
     *   as specified by the parameters
     *
     * @return {number[]}  The original height, depth, width, the changes in height, depth,
     *                    and width, and the horizontal and vertical offsets of the content
     */
     getDimens() {
      const values = this.node.attributes.getList('width', 'height', 'depth', 'lspace', 'voffset');
      const bbox = this.childNodes[0].getBBox();  // get unmodified bbox of children
      let {w, h, d} = bbox;
      let W = w, H = h, D = d, x = 0, y = 0, dx = 0;
      if (values.width !== '')   w = this.dimen(values.width, bbox, 'w', 0);
      if (values.height !== '')  h = this.dimen(values.height, bbox, 'h', 0);
      if (values.depth !== '')   d = this.dimen(values.depth, bbox, 'd', 0);
      if (values.voffset !== '') y = this.dimen(values.voffset, bbox);
      if (values.lspace !== '')  x = this.dimen(values.lspace, bbox);
      const align = this.node.attributes.get('data-align') ;
      if (align) {
        dx = this.getAlignX(w, bbox, align);
      }
      return [H, D, W, h - H, d - D, w - W, x, y, dx];
    }

    /**
     * Get a particular dimension, which can be relative to any of the BBox dimensions,
     *   and can be an offset from the default size of the given dimension.
     *
     * @param {Property} length   The value to be converted to a length in ems
     * @param {BBox} bbox         The bbox of the mpadded content
     * @param {string} d          The default dimension to use for relative sizes ('w', 'h', or 'd')
     * @param {number} m          The minimum value allowed for the dimension
     * @return {number}           The final dimension in ems
     */
     dimen(length, bbox, d = '', m = null) {
      length = String(length);
      const match = length.match(/width|height|depth/);
      const size = (match ? bbox[match[0].charAt(0) ] :
                    (d ? bbox[d ] : 0)) ;
      let dimen = (this.length2em(length, size) || 0);
      if (length.match(/^[-+]/) && d) {
        dimen += size;
      }
      if (m != null) {
        dimen = Math.max(m, dimen);
      }
      return dimen;
    }

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      const [H, D, W, dh, dd, dw] = this.getDimens();
      bbox.w = W + dw;
      bbox.h = H + dh;
      bbox.d = D + dd;
      this.setChildPWidths(recompute, bbox.w);
    }

    /**
     * @override
     */
     getWrapWidth(_i) {
      return this.getBBox().w;
    }

    /**
     * @override
     */
     getChildAlign(_i) {
      return this.node.attributes.get('data-align')  || 'left';
    }
  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 * The CHTMLmpadded wrapper for the MmlMpadded object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmpadded extends
CommonMpaddedMixin(CHTMLWrapper) {

  /**
   * The mpadded wrapper
   */
   static __initStatic() {this.kind = MmlMpadded.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-mpadded': {
      display: 'inline-block'
    },
    'mjx-rbox': {
      display: 'inline-block',
      position: 'relative'
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    let chtml = this.standardCHTMLnode(parent);
    const content = [];
    const style = {};
    const [ , , W, dh, dd, dw, x, y, dx] = this.getDimens();
    //
    // If the width changed, set the width explicitly
    //
    if (dw) {
      style.width = this.em(W + dw);
    }
    //
    // If the height or depth changed, use margin to make the change
    //
    if (dh || dd) {
      style.margin = this.em(dh) + ' 0 ' + this.em(dd);
    }
    //
    // If there is a horizontal or vertical shift,
    //   use relative positioning to move the contents
    //
    if (x + dx || y) {
      style.position = 'relative';
      const rbox = this.html('mjx-rbox', {style: {left: this.em(x + dx), top: this.em(-y)}});
      if (x + dx && this.childNodes[0].getBBox().pwidth) {
        this.adaptor.setAttribute(rbox, 'width', 'full');
        this.adaptor.setStyle(rbox, 'left', this.em(x));
      }
      content.push(rbox);
    }
    //
    //  Create the HTML with the proper styles and content
    //
    chtml = this.adaptor.append(chtml, this.html('mjx-block', {style: style}, content)) ;
    for (const child of this.childNodes) {
      child.toCHTML(content[0] || chtml);
    }
  }

} CHTMLmpadded.__initStatic(); CHTMLmpadded.__initStatic2();

/*****************************************************************/

const ARROWX = 4, ARROWDX = 1, ARROWY = 2;  // default relative arrowhead values

const THICKNESS = .067;  // default rule thickness
const PADDING = .2;      // default padding

const SOLID = THICKNESS + 'em solid';  // a solid border

/*****************************************************************/

/**
 * Shorthand for CommonMenclose
 */














































/*****************************************************************/

/**
 * The names and indices of sides for borders, padding, etc.
 */
const sideIndex = {top: 0, right: 1, bottom: 2, left: 3};

const sideNames = Object.keys(sideIndex) ;

/**
 * Common BBox and Border functions
 */
const fullBBox = ((node) => new Array(4).fill(node.thickness + node.padding)) ;
const fullBorder = ((node) => new Array(4).fill(node.thickness)) ;

/*****************************************************************/

/**
 * The length of an arrowhead
 */
const arrowHead = (node) => {
  return Math.max(node.padding, node.thickness * (node.arrowhead.x + node.arrowhead.dx + 1));
};

/**
 * Adjust short bbox for tall arrow heads
 */
const arrowBBoxHD = (node, TRBL) => {
  if (node.childNodes[0]) {
    const {h, d} = node.childNodes[0].getBBox();
    TRBL[0] = TRBL[2] = Math.max(0, node.thickness * node.arrowhead.y - (h + d) / 2);
  }
  return TRBL;
};

/**
 * Adjust thin bbox for wide arrow heads
 */
const arrowBBoxW = (node, TRBL) => {
  if (node.childNodes[0]) {
    const {w} = node.childNodes[0].getBBox();
    TRBL[1] = TRBL[3] = Math.max(0, node.thickness * node.arrowhead.y - w / 2);
  }
  return TRBL;
};

/**
 * The data for horizontal and vertical arrow notations
 *   [angle, double, isVertical, remove]
 */
const arrowDef = {
  up:        [-Math.PI / 2, false, true,  'verticalstrike'],
  down:      [ Math.PI / 2, false, true,  'verticakstrike'],
  right:     [ 0,           false, false, 'horizontalstrike'],
  left:      [ Math.PI,     false, false, 'horizontalstrike'],
  updown:    [ Math.PI / 2, true,  true,  'verticalstrike uparrow downarrow'],
  leftright: [ 0,           true,  false, 'horizontalstrike leftarrow rightarrow']
} ;

/**
 * The data for diagonal arrow notations
 *   [c, pi, double, remove]
 */
const diagonalArrowDef = {
  updiagonal:         [-1, 0,       false, 'updiagonalstrike northeastarrow'],
  northeast:          [-1, 0,       false, 'updiagonalstrike updiagonalarrow'],
  southeast:          [ 1, 0,       false, 'downdiagonalstrike'],
  northwest:          [ 1, Math.PI, false, 'downdiagonalstrike'],
  southwest:          [-1, Math.PI, false, 'updiagonalstrike'],
  northeastsouthwest: [-1, 0,       true,  'updiagonalstrike northeastarrow updiagonalarrow southwestarrow'],
  northwestsoutheast: [ 1, 0,       true,  'downdiagonalstrike northwestarrow southeastarrow']
} ;

/**
 * The BBox functions for horizontal and vertical arrows
 */
const arrowBBox = {
  up:    (node) => arrowBBoxW(node, [arrowHead(node), 0, node.padding, 0]),
  down:  (node) => arrowBBoxW(node, [node.padding, 0, arrowHead(node), 0]),
  right: (node) => arrowBBoxHD(node, [0, arrowHead(node), 0, node.padding]),
  left:  (node) => arrowBBoxHD(node, [0, node.padding, 0, arrowHead(node)]),
  updown:    (node) => arrowBBoxW(node, [arrowHead(node), 0, arrowHead(node), 0]),
  leftright: (node) => arrowBBoxHD(node, [0, arrowHead(node), 0, arrowHead(node)])
} ;

/*****************************************************************/

/**
 * @param {Renderer} render     The function for adding the border to the node
 * @return {string => DefPair}  The function returingn the notation definition
 *                              for the notation having a line on the given side
 */
const CommonBorder = function(render) {
  /**
   * @param {string} side   The side on which a border should appear
   * @return {DefPair}      The notation definition for the notation having a line on the given side
   */
  return (side) => {
    const i = sideIndex[side];
    return [side, {
      //
      // Add the border to the main child object
      //
      renderer: render,
      //
      // Indicate the extra space on the given side
      //
      bbox: (node) => {
        const bbox = [0, 0, 0, 0];
        bbox[i] = node.thickness + node.padding;
        return bbox;
      },
      //
      // Indicate the border on the given side
      //
      border: (node) => {
        const bbox = [0, 0, 0, 0];
        bbox[i] = node.thickness;
        return bbox;
      }
    }];
  };
};

/**
 * @param {Renderer} render                    The function for adding the borders to the node
 * @return {(sring, Side, Side) => DefPair}    The function returning the notation definition
 *                                             for the notation having lines on two sides
 */
const CommonBorder2 = function(render)
 {
  /**
   * @param {string} name    The name of the notation to define
   * @param {Side} side1   The first side to get a border
   * @param {Side} side2   The second side to get a border
   * @return {DefPair}       The notation definition for the notation having lines on two sides
   */
  return (name, side1, side2) => {
    const i1 = sideIndex[side1];
    const i2 = sideIndex[side2];
    return [name, {
      //
      // Add the border along the given sides
      //
      renderer: render,
      //
      // Mark the extra space along the two sides
      //
      bbox: (node) => {
        const t = node.thickness + node.padding;
        const bbox = [0, 0, 0, 0];
        bbox[i1] = bbox[i2] = t;
        return bbox;
      },
      //
      // Indicate the border on the two sides
      //
      border: (node) => {
        const bbox = [0, 0, 0, 0];
        bbox[i1] = bbox[i2] = node.thickness;
        return bbox;
      },
      //
      // Remove the single side notations, if present
      //
      remove: side1 + ' ' + side2
    }];
  };
};

/*****************************************************************/

/**
 * @param {string => Renderer} render      The function for adding the strike to the node
 * @return {string => DefPair}   The function returning the notation definition for the diagonal strike
 */
const CommonDiagonalStrike = function(render)
 {
  /**
   * @param {string} name  The name of the diagonal strike to define
   * @return {DefPair}     The notation definition for the diagonal strike
   */
  return (name) => {
    const cname = 'mjx-' + name.charAt(0) + 'strike';
    return [name + 'diagonalstrike', {
      //
      // Find the angle and width from the bounding box size and create the diagonal line
      //
      renderer: render(cname),
      //
      //  Add padding all around
      //
      bbox: fullBBox
    }];
  };
};

/*****************************************************************/

/**
 * @param {Renderer} render     The function to add the arrow to the node
 * @return {string => DefPair}  The funciton returning the notation definition for the diagonal arrow
 */
const CommonDiagonalArrow = function(render) {
  /**
   * @param {string} name   The name of the diagonal arrow to define
   * @return {DefPair}      The notation definition for the diagonal arrow
   */
  return (name) => {
    const [c, pi, double, remove] = diagonalArrowDef[name];
    return [name + 'arrow', {
      //
      // Find the angle and width from the bounding box size and create
      //   the arrow from them and the other arrow data
      //
      renderer: (node, _child) => {
        const {a, W} = node.arrowData();
        const arrow = node.arrow(W, c * (a - pi), double);
        render(node, arrow);
      },
      //
      // Add space for the arrowhead all around
      //
      bbox: (node) => {
        const {a, x, y} = node.arrowData();
        const [ax, ay, adx] = [node.arrowhead.x, node.arrowhead.y, node.arrowhead.dx];
        const [b, ar] = node.getArgMod(ax + adx, ay);
        const dy = y + (b > a ? node.thickness * ar * Math.sin(b - a) : 0);
        const dx = x + (b > Math.PI / 2 - a ? node.thickness * ar * Math.sin(b + a - Math.PI / 2) : 0);
        return [dy, dx, dy, dx];
      },
      //
      // Remove redundant notations
      //
      remove: remove
    }];
  };
};

/**
 * @param {Renderer} render     The function to add the arrow to the node
 * @return {string => DefPair}  The function returning the notation definition for the arrow
 */
const CommonArrow = function(render) {
  /**
   * @param {string} name   The name of the horizontal or vertical arrow to define
   * @return {DefPair}      The notation definition for the arrow
   */
  return (name) => {
    const [angle, double, isVertical, remove] = arrowDef[name];
    return [name + 'arrow', {
      //
      // Get the arrow height and depth from the bounding box and the arrow direction
      //   then create the arrow from that and the other data
      //
      renderer: (node, _child) => {
        const {w, h, d} = node.getBBox();
        const W = (isVertical ? h + d : w);
        const arrow = node.arrow(W, angle, double);
        render(node, arrow);
      },
      //
      // Add the padding to the proper sides
      //
      bbox: arrowBBox[name],
      //
      // Remove redundant notations
      //
      remove: remove
    }];
  };
};

var _class$3;

/*****************************************************************/
/**
 * The CommonMenclose interface
 *
 * @template W  The menclose wrapper type
 */

























































































































/*****************************************************************/
/**
 * The CommonMenclose wrapper mixin for the MmlMenclose object
 *
 * @template W  The menclose wrapper type
 * @templare N  The DOM node class
 * @templare S  The msqrt wrapper class
 * @template T  The Wrapper class constructor type
 */
function CommonMencloseMixin




(Base) {

  return (_class$3 = class extends Base {

    /**
     *  The notations active on this menclose, if any
     */
     __init() {this.notations = {};}

    /**
     *  The notation to use for the child, if any
     */
     __init2() {this.renderChild = null;}

    /**
     * fake msqrt for radial notation (if used)
     */
     __init3() {this.msqrt = null;}

    /**
     * The padding of the arrow head (may be overridden using data-padding attibute)
     */
     __init4() {this.padding = PADDING;}
    /**
     * The thickness of the arrow head (may be overridden using data-thickness attibute)
     */
     __init5() {this.thickness = THICKNESS;}
    /**
     * The shape of the arrow head (may be overridden using data-arrowhead attibutes)
     */
     __init6() {this.arrowhead = {x: ARROWX, y: ARROWY, dx: ARROWDX};}

    /**
     * @override
     * @constructor
     */
    constructor(...args) {
      super(...args);_class$3.prototype.__init.call(this);_class$3.prototype.__init2.call(this);_class$3.prototype.__init3.call(this);_class$3.prototype.__init4.call(this);_class$3.prototype.__init5.call(this);_class$3.prototype.__init6.call(this);      this.getParameters();
      this.getNotations();
      this.removeRedundantNotations();
      this.initializeNotations();
    }

    /**
     * Look up the data-* attributes and override the default values
     */
     getParameters() {
      const attributes = this.node.attributes;
      const padding = attributes.get('data-padding');
      if (padding !== undefined) {
        this.padding = this.length2em(padding, PADDING);
      }
      const thickness = attributes.get('data-thickness');
      if (thickness !== undefined) {
        this.thickness = this.length2em(thickness, THICKNESS);
      }
      const arrowhead = attributes.get('data-arrowhead') ;
      if (arrowhead !== undefined) {
        let [x, y, dx] = split(arrowhead);
        this.arrowhead = {
          x: (x ? parseFloat(x) : ARROWX),
          y: (y ? parseFloat(y) : ARROWY),
          dx: (dx ? parseFloat(dx) : ARROWDX)
        };
      }
    }

    /**
     *  Get the notations given in the notation attribute
     *    and check if any are used to render the child nodes
     */
     getNotations() {
      const Notations = (this.constructor ).notations;
      for (const name of split(this.node.attributes.get('notation') )) {
        const notation = Notations.get(name);
        if (notation) {
          this.notations[name] = notation;
          if (notation.renderChild) {
            this.renderChild = notation.renderer;
          }
        }
      }
    }

    /**
     *  Remove any redundant notations
     */
     removeRedundantNotations() {
      for (const name of Object.keys(this.notations)) {
        if (this.notations[name]) {
          const remove = this.notations[name].remove || '';
          for (const notation of remove.split(/ /)) {
            delete this.notations[notation];
          }
        }
      }
    }

    /**
     *  Run any initialization needed by notations in use
     */
     initializeNotations() {
      for (const name of Object.keys(this.notations)) {
        const init = this.notations[name].init;
        init && init(this );
      }
    }

    /********************************************************/

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      //
      //  Combine the BBox from the child and add the extenders
      //
      let [T, R, B, L] = this.getBBoxExtenders();
      const child = this.childNodes[0].getBBox();
      bbox.combine(child, L, 0);
      bbox.h += T;
      bbox.d += B;
      bbox.w += R;
      this.setChildPWidths(recompute);
    }

    /**
     * @return {number[]}  Array of the maximum extra space from the notations along each side
     */
     getBBoxExtenders() {
      let TRBL = [0, 0, 0, 0];
      for (const name of Object.keys(this.notations)) {
        this.maximizeEntries(TRBL, this.notations[name].bbox(this ));
      }
      return TRBL;
    }

    /**
     * @return {number[]}  Array of padding (i.e., BBox minus border) along each side
     */
     getPadding() {
      let TRBL = [0, 0, 0, 0];
      let BTRBL = [0, 0, 0, 0];
      for (const name of Object.keys(this.notations)) {
        this.maximizeEntries(TRBL, this.notations[name].bbox(this ));
        const border = this.notations[name].border;
        if (border) {
          this.maximizeEntries(BTRBL, border(this ));
        }
      }
      return [0, 1, 2, 3].map(i => TRBL[i] - BTRBL[i]);
    }

    /**
     * Each entry in X gets replaced by the corresponding one in Y if it is larger
     *
     * @param {number[]} X   An array of numbers
     * @param {number[]} Y   An array of numbers that replace smaller ones in X
     */
     maximizeEntries(X, Y) {
      for (let i = 0; i < X.length; i++) {
        if (X[i] < Y[i]) {
          X[i] = Y[i];
        }
      }
    }

    /********************************************************/

    /**
     * @param {number} w    The width of the box whose diagonal is needed
     * @param {number} h    The height of the box whose diagonal is needed
     * @return {number[]}   The angle and width of the diagonal of the box
     */
     getArgMod(w, h) {
      return [Math.atan2(h, w), Math.sqrt(w * w + h * h)];
    }

    /**
     * Create an arrow using an svg element
     *
     * @param {number} w        The length of the arrow
     * @param {number} a        The angle for the arrow
     * @param {boolean} double  True if this is a double-headed arrow
     * @return {N}              The newly created arrow
     */
     arrow(_w, _a, _double = false) {
      return null ;
    }

    /**
     * Get the angle and width of a diagonal arrow, plus the x and y extension
     *   past the content bounding box
     *
     * @return {Object}  The angle, width, and x and y extentions
     */
     arrowData() {
      const [p, t] = [this.padding, this.thickness];
      const r = t * (this.arrowhead.x + Math.max(1, this.arrowhead.dx));
      const {h, d, w} = this.childNodes[0].getBBox();
      const H = h + d;
      const R = Math.sqrt(H * H + w * w);
      const x = Math.max(p, r * w / R);
      const y = Math.max(p, r * H / R);
      const [a, W] = this.getArgMod(w + 2 * x, H + 2 * y);
      return {a, W, x, y};
    }

    /********************************************************/

    /**
     * Create an unattached msqrt wrapper to render the 'radical' notation.
     *   We replace the inferred mrow of the msqrt with the one from the menclose
     *   but without changing the parent pointer, so as not to detach it from
     *   the menclose (which would desrtoy the original MathML tree).
     *
     * @param {W} child   The inferred mrow that is the child of this menclose
     * @return {S}        The newly created (but detached) msqrt wrapper
     */
     createMsqrt(child) {
      const mmlFactory = (this.node ).factory;
      const mml = mmlFactory.create('msqrt');
      mml.inheritAttributesFrom(this.node);
      mml.childNodes[0] = child.node;
      const node = this.wrap(mml) ;
      node.parent = this;
      return node;
    }

    /**
     * @return {number[]}  The differences between the msqrt bounding box
     *                     and its child bounding box (i.e., the extra space
     *                     created by the radical symbol).
     */
     sqrtTRBL() {
      const bbox = this.msqrt.getBBox();
      const cbox = this.msqrt.childNodes[0].getBBox();
      return [bbox.h - cbox.h, 0, bbox.d - cbox.d, bbox.w - cbox.w];
    }

  }, _class$3);
}

/*
 * Shorthands for common types
 */



/**
 * Create a named element (handled by CSS), and adjust it if thickness is non-standard
 *
 * @param {string} name    The name of the element to create
 * @param {string} offset  The offset direction to adjust if thickness is non-standard
 * @return {RENDERER}      The renderer function for the given element name
 */
const RenderElement = function(name, offset = '') {
  return ((node, _child) => {
    const shape = node.adjustBorder(node.html('mjx-' + name));
    if (offset && node.thickness !== THICKNESS) {
      const transform = 'translate' + offset + '(' + node.em(node.thickness / 2) + ')';
      node.adaptor.setStyle(shape, 'transform', transform);
    }
    node.adaptor.append(node.chtml, shape);
  }) ;
};

/**
 * @param {Notation.Side} side   The side on which a border should appear
 * @return {DEFPAIR}      The notation definition for the notation having a line on the given side
 */
const Border = function(side) {
  return CommonBorder((node, child) => {
    node.adaptor.setStyle(child, 'border-' + side, node.em(node.thickness) + ' solid');
  })(side);
};


/**
 * @param {string} name    The name of the notation to define
 * @param {Notation.Side} side1   The first side to get a border
 * @param {Notation.Side} side2   The second side to get a border
 * @return {DEFPAIR}       The notation definition for the notation having lines on two sides
 */
const Border2 = function(name, side1, side2) {
  return CommonBorder2((node, child) => {
    const border = node.em(node.thickness) + ' solid';
    node.adaptor.setStyle(child, 'border-' + side1, border);
    node.adaptor.setStyle(child, 'border-' + side2, border);
  })(name, side1, side2);
};

/**
 * @param {string} name  The name of the diagonal strike to define
 * @param {number} neg   1 or -1 to use with the angle
 * @return {DEFPAIR}     The notation definition for the diagonal strike
 */
const DiagonalStrike = function(name, neg) {
  return CommonDiagonalStrike((cname) => (node, _child) => {
    const {w, h, d} = node.getBBox();
    const [a, W] = node.getArgMod(w, h + d);
    const t = neg * node.thickness / 2;
    const strike = node.adjustBorder(node.html(cname, {style: {
      width: node.em(W),
      transform: 'rotate(' + node.fixed(-neg * a) + 'rad) translateY(' + t + 'em)',
    }}));
    node.adaptor.append(node.chtml, strike);
  })(name);
};

/**
 * @param {string} name   The name of the diagonal arrow to define
 * @return {DEFPAIR}      The notation definition for the diagonal arrow
 */
const DiagonalArrow = function(name) {
  return CommonDiagonalArrow((node, arrow) => {
    node.adaptor.append(node.chtml, arrow);
  })(name);
};

/**
 * @param {string} name   The name of the horizontal or vertical arrow to define
 * @return {DEFPAIR}      The notation definition for the arrow
 */
const Arrow = function(name) {
  return CommonArrow((node, arrow) => {
    node.adaptor.append(node.chtml, arrow);
  })(name);
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/

/**
 *  The skew angle needed for the arrow head pieces
 */
function Angle(x, y) {
  return Math.atan2(x, y).toFixed(3).replace(/\.?0+$/, '');
}

const ANGLE = Angle(ARROWDX, ARROWY);

/*****************************************************************/
/**
 * The CHTMLmenclose wrapper for the MmlMenclose object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmenclose extends
CommonMencloseMixin




(CHTMLWrapper) {

  /**
   * The menclose wrapper
   */
   static __initStatic() {this.kind = MmlMenclose.prototype.kind;}

  /**
   * Styles needed for the various notations
   */
   static __initStatic2() {this.styles = {
    'mjx-menclose': {
      position: 'relative'
    },
    'mjx-menclose > mjx-dstrike': {
      display: 'inline-block',
      left: 0, top: 0,
      position: 'absolute',
      'border-top': SOLID,
      'transform-origin': 'top left'
    },
    'mjx-menclose > mjx-ustrike': {
      display: 'inline-block',
      left: 0, bottom: 0,
      position: 'absolute',
      'border-top': SOLID,
      'transform-origin': 'bottom left'
    },
    'mjx-menclose > mjx-hstrike': {
      'border-top': SOLID,
      position: 'absolute',
      left: 0, right: 0, bottom: '50%',
      transform: 'translateY(' + em(THICKNESS / 2) + ')'
    },
    'mjx-menclose > mjx-vstrike': {
      'border-left': SOLID,
      position: 'absolute',
      top: 0, bottom: 0, right: '50%',
      transform: 'translateX(' + em(THICKNESS / 2) + ')'
    },
    'mjx-menclose > mjx-rbox': {
      position: 'absolute',
      top: 0, bottom: 0, right: 0, left: 0,
      'border': SOLID,
      'border-radius': em(THICKNESS + PADDING)
    },
    'mjx-menclose > mjx-cbox': {
      position: 'absolute',
      top: 0, bottom: 0, right: 0, left: 0,
      'border': SOLID,
      'border-radius': '50%'
    },
    'mjx-menclose > mjx-arrow': {
      position: 'absolute',
      left: 0, bottom: '50%', height: 0, width: 0
    },
    'mjx-menclose > mjx-arrow > *': {
      display: 'block',
      position: 'absolute',
      'transform-origin': 'bottom',
      'border-left': em(THICKNESS * ARROWX) + ' solid',
      'border-right': 0,
      'box-sizing': 'border-box'
    },
    'mjx-menclose > mjx-arrow > mjx-aline': {
      left: 0, top: em(-THICKNESS / 2),
      right: em(THICKNESS * (ARROWX - 1)), height: 0,
      'border-top': em(THICKNESS) + ' solid',
      'border-left': 0
    },
    'mjx-menclose > mjx-arrow[double] > mjx-aline': {
      left: em(THICKNESS * (ARROWX - 1)), height: 0,
    },
    'mjx-menclose > mjx-arrow > mjx-rthead': {
      transform: 'skewX(' + ANGLE + 'rad)',
      right: 0, bottom: '-1px',
      'border-bottom': '1px solid transparent',
      'border-top': em(THICKNESS * ARROWY) + ' solid transparent'
    },
    'mjx-menclose > mjx-arrow > mjx-rbhead': {
      transform: 'skewX(-' + ANGLE + 'rad)',
      'transform-origin': 'top',
      right: 0, top: '-1px',
      'border-top': '1px solid transparent',
      'border-bottom': em(THICKNESS * ARROWY) + ' solid transparent'
    },
    'mjx-menclose > mjx-arrow > mjx-lthead': {
      transform: 'skewX(-' + ANGLE + 'rad)',
      left: 0, bottom: '-1px',
      'border-left': 0,
      'border-right': em(THICKNESS * ARROWX) + ' solid',
      'border-bottom': '1px solid transparent',
      'border-top': em(THICKNESS * ARROWY) + ' solid transparent'
    },
    'mjx-menclose > mjx-arrow > mjx-lbhead': {
      transform: 'skewX(' + ANGLE + 'rad)',
      'transform-origin': 'top',
      left: 0, top: '-1px',
      'border-left': 0,
      'border-right': em(THICKNESS * ARROWX) + ' solid',
      'border-top': '1px solid transparent',
      'border-bottom': em(THICKNESS * ARROWY) + ' solid transparent'
    },
    'mjx-menclose > dbox': {
      position: 'absolute',
      top: 0, bottom: 0, left: em(-1.5 * PADDING),
      width: em(3 * PADDING),
      border: em(THICKNESS) + ' solid',
      'border-radius': '50%',
      'clip-path': 'inset(0 0 0 ' + em(1.5 * PADDING) + ')',
      'box-sizing': 'border-box'
    }
  };}

  /**
   *  The definitions of the various notations
   */
   static __initStatic3() {this.notations = new Map([

    Border('top'),
    Border('right'),
    Border('bottom'),
    Border('left'),

    Border2('actuarial', 'top', 'right'),
    Border2('madruwb', 'bottom', 'right'),

    DiagonalStrike('up', 1),
    DiagonalStrike('down', -1),

    ['horizontalstrike', {
      renderer: RenderElement('hstrike', 'Y'),
      bbox: (node) => [0, node.padding, 0, node.padding]
    }],

    ['verticalstrike', {
      renderer: RenderElement('vstrike', 'X'),
      bbox: (node) => [node.padding, 0, node.padding, 0]
    }],

    ['box', {
      renderer: (node, child) => {
        node.adaptor.setStyle(child, 'border', node.em(node.thickness) + ' solid');
      },
      bbox: fullBBox,
      border: fullBorder,
      remove: 'left right top bottom'
    }],

    ['roundedbox', {
      renderer: RenderElement('rbox'),
      bbox: fullBBox
    }],

    ['circle', {
      renderer: RenderElement('cbox'),
      bbox: fullBBox
    }],

    ['phasorangle', {
      //
      // Use a bottom border and an upward strike properly angled
      //
      renderer: (node, child) => {
        const {h, d} = node.getBBox();
        const [a, W] = node.getArgMod(1.75 * node.padding, h + d);
        const t = node.thickness * Math.sin(a) * .9;
        node.adaptor.setStyle(child, 'border-bottom', node.em(node.thickness) + ' solid');
        const strike = node.adjustBorder(node.html('mjx-ustrike', {style: {
          width: node.em(W),
          transform: 'translateX(' + node.em(t) + ') rotate(' + node.fixed(-a) + 'rad)',
        }}));
        node.adaptor.append(node.chtml, strike);
      },
      bbox: (node) => {
        const p = node.padding / 2;
        const t = node.thickness;
        return [2 * p, p, p + t, 3 * p + t];
      },
      border: (node) => [0, 0, node.thickness, 0],
      remove: 'bottom'
    }],

    Arrow('up'),
    Arrow('down'),
    Arrow('left'),
    Arrow('right'),

    Arrow('updown'),
    Arrow('leftright'),

    DiagonalArrow('updiagonal'),  // backward compatibility
    DiagonalArrow('northeast'),
    DiagonalArrow('southeast'),
    DiagonalArrow('northwest'),
    DiagonalArrow('southwest'),

    DiagonalArrow('northeastsouthwest'),
    DiagonalArrow('northwestsoutheast'),

    ['longdiv', {
      //
      // Use a line along the top followed by a half ellipse at the left
      //
      renderer: (node, child) => {
        const adaptor = node.adaptor;
        adaptor.setStyle(child, 'border-top', node.em(node.thickness) + ' solid');
        const arc = adaptor.append(node.chtml, node.html('dbox'));
        const t = node.thickness;
        const p = node.padding;
        if (t !== THICKNESS) {
          adaptor.setStyle(arc, 'border-width', node.em(t));
        }
        if (p !== PADDING) {
          adaptor.setStyle(arc, 'left', node.em(-1.5 * p));
          adaptor.setStyle(arc, 'width', node.em(3 * p));
          adaptor.setStyle(arc, 'clip-path', 'inset(0 0 0 ' + node.em(1.5 * p) + ')');
        }
      },
      bbox: (node) => {
        const p = node.padding;
        const t = node.thickness;
        return [p + t, p, p, 2 * p + t / 2];
      }
    }],

    ['radical', {
      //
      //  Use the msqrt rendering, but remove the extra space due to the radical
      //    (it is added in at the end, so other notations overlap the root)
      //
      renderer: (node, child) => {
        node.msqrt.toCHTML(child);
        const TRBL = node.sqrtTRBL();
        node.adaptor.setStyle(node.msqrt.chtml, 'margin', TRBL.map(x => node.em(-x)).join(' '));
      },
      //
      //  Create the needed msqrt wrapper
      //
      init: (node) => {
        node.msqrt = node.createMsqrt(node.childNodes[0]);
      },
      //
      //  Add back in the padding for the square root
      //
      bbox: (node) => node.sqrtTRBL(),
      //
      //  This notation replaces the child
      //
      renderChild: true
    }]

  ] );}

  /********************************************************/

  /**
   * @override
   */
   toCHTML(parent) {
    const adaptor = this.adaptor;
    const chtml = this.standardCHTMLnode(parent);
    //
    //  Create a box for the child (that can have padding and borders added by the notations)
    //    and add the child HTML into it
    //
    const block = adaptor.append(chtml, this.html('mjx-box')) ;
    if (this.renderChild) {
      this.renderChild(this, block);
    } else {
      this.childNodes[0].toCHTML(block);
    }
    //
    //  Render all the notations for this menclose element
    //
    for (const name of Object.keys(this.notations)) {
      const notation = this.notations[name];
      !notation.renderChild && notation.renderer(this, block);
    }
    //
    //  Add the needed padding, if any
    //
    const pbox = this.getPadding();
    for (const name of sideNames) {
      const i = sideIndex[name];
      pbox[i] > 0 && adaptor.setStyle(block, 'padding-' + name, this.em(pbox[i]));
    }
  }

  /********************************************************/

  /**
   * Create an arrow using HTML elements
   *
   * @param {number} w        The length of the arrow
   * @param {number} a        The angle for the arrow
   * @param {boolean} double  True if this is a double-headed arrow
   * @return {N}               The newly created arrow
   */
   arrow(w, a, double = false) {
    const W = this.getBBox().w;
    const style = {width: this.em(w)} ;
    if (W !== w) {
      style.left = this.em((W - w) / 2);
    }
    if (a) {
      style.transform = 'rotate(' + this.fixed(a) + 'rad)';
    }
    const arrow = this.html('mjx-arrow', {style: style}, [
      this.html('mjx-aline'), this.html('mjx-rthead'), this.html('mjx-rbhead')
    ]);
    if (double) {
      this.adaptor.append(arrow, this.html('mjx-lthead'));
      this.adaptor.append(arrow, this.html('mjx-lbhead'));
      this.adaptor.setAttribute(arrow, 'double', 'true');
    }
    this.adjustArrow(arrow, double);
    return arrow;
  }

  /**
   * @param {N} arrow          The arrow whose thickness and arrow head is to be adjusted
   * @param {boolean} double   True if the arrow is double-headed
   */
   adjustArrow(arrow, double) {
    const t = this.thickness;
    const head = this.arrowhead;
    if (head.x === ARROWX && head.y === ARROWY &&
        head.dx === ARROWDX && t === THICKNESS) return;
    const [x, y] = [t * head.x, t * head.y].map(x => this.em(x));
    const a = Angle(head.dx, head.y);
    const [line, rthead, rbhead, lthead, lbhead] = this.adaptor.childNodes(arrow);
    this.adjustHead(rthead, [y, '0', '1px', x], a);
    this.adjustHead(rbhead, ['1px', '0', y, x], '-' + a);
    this.adjustHead(lthead, [y, x, '1px', '0'], '-' + a);
    this.adjustHead(lbhead, ['1px', x, y, '0'], a);
    this.adjustLine(line, t, head.x, double);
  }

  /**
   * @param {N} head            The piece of arrow head to be adjusted
   * @param {string[]} border   The border sizes [T, R, B, L]
   * @param {string} a          The skew angle for the piece
   */
   adjustHead(head, border, a) {
    if (head) {
      this.adaptor.setStyle(head, 'border-width', border.join(' '));
      this.adaptor.setStyle(head, 'transform', 'skewX(' + a + 'rad)');
    }
  }

  /**
   * @param {N} line           The arrow shaft to be adjusted
   * @param {number} t         The arrow shaft thickness
   * @param {number} x         The arrow head x size
   * @param {boolean} double   True if the arrow is double-headed
   */
   adjustLine(line, t, x, double) {
    this.adaptor.setStyle(line, 'borderTop', this.em(t) + ' solid');
    this.adaptor.setStyle(line, 'top', this.em(-t / 2));
    this.adaptor.setStyle(line, 'right', this.em(t * (x - 1)));
    if (double) {
      this.adaptor.setStyle(line, 'left', this.em(t * (x - 1)));
    }
  }

  /********************************************************/

  /**
   * @param {N} node   The HTML element whose border width must be
   *                   adjusted if the thickness isn't the default
   * @return {N}       The adjusted element
   */
   adjustBorder(node) {
    if (this.thickness !== THICKNESS) {
      this.adaptor.setStyle(node, 'borderWidth', this.em(this.thickness));
    }
    return node;
  }

  /**
   * @param {N} shape   The svg element whose stroke-thickness must be
   *                    adjusted if the thickness isn't the default
   * @return {N}        The adjusted element
   */
   adjustThickness(shape) {
    if (this.thickness !== THICKNESS) {
      this.adaptor.setStyle(shape, 'strokeWidth', this.fixed(this.thickness));
    }
    return shape;
  }

  /********************************************************/

  /**
   * @param {number} m    A number to be shown with a fixed number of digits
   * @param {number=} n   The number of digits to use
   * @return {string}     The formatted number
   */
   fixed(m, n = 3) {
    if (Math.abs(m) < .0006) {
      return '0';
    }
    return m.toFixed(n).replace(/\.?0+$/, '');
  }

  /**
   * @override
   * (make it public so it can be called by the notation functions)
   */
   em(m) {
    return super.em(m);
  }

} CHTMLmenclose.__initStatic(); CHTMLmenclose.__initStatic2(); CHTMLmenclose.__initStatic3();

/*****************************************************************/
/**
 * The CommonMrow interface
 */













/*****************************************************************/
/**
 * The CommonMrow wrapper mixin for the MmlMrow object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMrowMixin(Base) {

  return class extends Base {

    /**
     * @override
     */
    get fixesPWidth() {
      return false;
    }

    /**
     * @override
     * @constructor
     */
    constructor(...args) {
      super(...args);
      this.stretchChildren();
      for (const child of this.childNodes) {
        if (child.bbox.pwidth) {
          this.bbox.pwidth = BBox.fullWidth;
          break;
        }
      }
    }

    /**
     * Handle vertical stretching of children to match height of
     *  other nodes in the row.
     */
     stretchChildren() {
      let stretchy = [];
      //
      //  Locate and count the stretchy children
      //
      for (const child of this.childNodes) {
        if (child.canStretch(DIRECTION.Vertical)) {
          stretchy.push(child);
        }
      }
      let count = stretchy.length;
      let nodeCount = this.childNodes.length;
      if (count && nodeCount > 1) {
        let H = 0, D = 0;
        //
        //  If all the children are stretchy, find the largest one,
        //  otherwise, find the height and depth of the non-stretchy
        //  children.
        //
        let all = (count > 1 && count === nodeCount);
        for (const child of this.childNodes) {
          const noStretch = (child.stretch.dir === DIRECTION.None);
          if (all || noStretch) {
            const {h, d} = child.getBBox(noStretch);
            if (h > H) H = h;
            if (d > D) D = d;
          }
        }
        //
        //  Stretch the stretchable children
        //
        for (const child of stretchy) {
          (child.coreMO() ).getStretchedVariant([H, D]);
        }
      }
    }

  };
}

/*****************************************************************/
/*****************************************************************/
/**
 * The CommonInferredMrow interface
 */








/*****************************************************************/
/**
 * The CommonInferredMrow wrapper mixin for the MmlInferredMrow object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonInferredMrowMixin(Base) {

  return class extends Base {

    /**
     * Since inferred rows don't produce a container span, we can't
     * set a font-size for it, so we inherit the parent scale
     *
     * @override
     */
     getScale() {
      this.bbox.scale = this.parent.bbox.scale;
      this.bbox.rscale = 1;
    }
  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 * The CHTMLmrow wrapper for the MmlMrow object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmrow extends
CommonMrowMixin(CHTMLWrapper) {

  /**
   * The mrow wrapper
   */
   static __initStatic() {this.kind = MmlMrow.prototype.kind;}

  /**
   * @override
   */
   toCHTML(parent) {
    const chtml = (this.node.isInferred ? (this.chtml = parent) : this.standardCHTMLnode(parent));
    let hasNegative = false;
    for (const child of this.childNodes) {
      child.toCHTML(chtml);
      if (child.bbox.w < 0) {
        hasNegative = true;
      }
    }
    // FIXME:  handle line breaks
    if (hasNegative) {
      const {w} = this.getBBox();
      if (w) {
        this.adaptor.setStyle(chtml, 'width', this.em(Math.max(0, w)));
        if (w < 0) {
          this.adaptor.setStyle(chtml, 'marginRight', this.em(w));
        }
      }
    }
  }

} CHTMLmrow.__initStatic();

/*****************************************************************/
/**
 *  The CHTMLinferredMrow wrapper for the MmlInferredMrow object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLinferredMrow extends
CommonInferredMrowMixin(CHTMLmrow) {

  /**
   * The inferred-mrow wrapper
   */
   static __initStatic2() {this.kind = MmlInferredMrow.prototype.kind;}

} CHTMLinferredMrow.__initStatic2();

var _class$4;




























/*****************************************************************/
/**
 * The CommonMfenced interface
 */































/*****************************************************************/
/**
 * The CommonMfenced wrapper mixin for the MmlMfenced object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMfencedMixin(Base) {

  return (_class$4 = class extends Base {

    /**
     * An mrow to use for the layout of the mfenced
     */
     __init() {this.mrow = null;}

    /**
     * @override
     * @constructor
     */
    constructor(...args) {
      super(...args);_class$4.prototype.__init.call(this);      this.createMrow();
      this.addMrowChildren();
    }

    /**
     * Creates the mrow wrapper to use for the layout
     */
     createMrow() {
      const mmlFactory = (this.node ).factory;
      const mrow = mmlFactory.create('inferredMrow');
      mrow.inheritAttributesFrom(this.node);
      this.mrow = this.wrap(mrow) ;
      this.mrow.parent = this;
    }

    /**
     * Populate the mrow with wrapped mo elements interleaved
     *   with the mfenced children (the mo's are already created
     *   in the mfenced object)
     */
     addMrowChildren() {
      const mfenced = this.node ;
      const mrow = this.mrow;
      this.addMo(mfenced.open);
      if (this.childNodes.length) {
        mrow.childNodes.push(this.childNodes[0]);
      }
      let i = 0;
      for (const child of this.childNodes.slice(1)) {
        this.addMo(mfenced.separators[i++]);
        mrow.childNodes.push(child);
      }
      this.addMo(mfenced.close);
      mrow.stretchChildren();
    }

    /**
     * Wrap an mo element and push it onto the mrow
     *
     * @param {MmlNode} node  The mo element to push on the mrow
     */
     addMo(node) {
      if (!node) return;
      const mo = this.wrap(node);
      this.mrow.childNodes.push(mo);
      mo.parent = this.mrow;
    }

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      bbox.updateFrom(this.mrow.getBBox());
      this.setChildPWidths(recompute);
    }

  }, _class$4);

}

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 * The CHTMLmfenced wrapper for the MmlMfenced object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLmfenced extends CommonMfencedMixin(CHTMLWrapper) {

  /**
   * The mfenced wrapper
   */
   static __initStatic() {this.kind = MmlMfenced.prototype.kind;}

  /**
   * @override
   */
   toCHTML(parent) {
    const chtml = this.standardCHTMLnode(parent);
    (this.mrow ).toCHTML(chtml);
  }

} CHTMLmfenced.__initStatic();

var _class$5;

/*****************************************************************/
/**
 * The CommonMfrac interface
 */























































/*****************************************************************/
/**
 * The CommonMfrac wrapper mixin for the MmlMfrac object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMfracMixin(Base) {

  return (_class$5 = class extends Base {

    /**
     * Wrapper for <mo> to use for bevelled fraction
     */
     __init() {this.bevel = null;}

    /**
     * Padding around fractions
     */
    

    /************************************************/

    /**
     * @override
     * @constructor
     */
    constructor(...args) {
      super(...args);_class$5.prototype.__init.call(this);      this.pad = (this.node.getProperty('withDelims')  ? 0 : this.font.params.nulldelimiterspace);
      //
      //  create internal bevel mo element
      //
      if (this.node.attributes.get('bevelled')) {
        const {H} = this.getBevelData(this.isDisplay());
        const bevel = this.bevel = this.createMo('/') ;
        bevel.canStretch(DIRECTION.Vertical);
        bevel.getStretchedVariant([H], true);
      }
    }

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      bbox.empty();
      const {linethickness, bevelled} = this.node.attributes.getList('linethickness', 'bevelled');
      const display = this.isDisplay();
      let w = null ;
      if (bevelled) {
        this.getBevelledBBox(bbox, display);
      } else {
        const thickness = this.length2em(String(linethickness), .06);
        w = -2 * this.pad;
        if (thickness === 0) {
          this.getAtopBBox(bbox, display);
        } else {
          this.getFractionBBox(bbox, display, thickness);
          w -= .2;
        }
        w += bbox.w;
      }
      bbox.clean();
      this.setChildPWidths(recompute, w);
    }

    /************************************************/

    /**
     * @param {BBox} bbox        The buonding box to modify
     * @param {boolean} display  True for display-mode fractions
     * @param {number} t         The thickness of the line
     */
     getFractionBBox(bbox, display, t) {
      const nbox = this.childNodes[0].getBBox();
      const dbox = this.childNodes[1].getBBox();
      const tex = this.font.params;
      const a = tex.axis_height;
      const {T, u, v} = this.getTUV(display, t);
      bbox.combine(nbox, 0, a + T + Math.max(nbox.d * nbox.rscale, u));
      bbox.combine(dbox, 0, a - T - Math.max(dbox.h * dbox.rscale, v));
      bbox.w += 2 * this.pad + .2;
    }

    /**
     * @param {boolean} display  True for display-mode fractions
     * @param {number} t         The thickness of the line
     * @return {Object}          The expanded rule thickness (T), and baseline offsets
     *                             for numerator and denomunator (u and v)
     */
     getTUV(display, t) {
      const tex = this.font.params;
      const a = tex.axis_height;
      const T = (display ? 3.5 : 1.5) * t;
      return {T: (display ? 3.5 : 1.5) * t,
              u: (display ? tex.num1 : tex.num2) - a - T,
              v: (display ? tex.denom1 : tex.denom2) + a - T};
    }

    /************************************************/

    /**
     * @param {BBox} bbox        The bounding box to modify
     * @param {boolean} display  True for display-mode fractions
     */
     getAtopBBox(bbox, display) {
      const {u, v, nbox, dbox} = this.getUVQ(display);
      bbox.combine(nbox, 0, u);
      bbox.combine(dbox, 0, -v);
      bbox.w += 2 * this.pad;
    }

    /**
     * @param {boolean} display  True for diplay-mode fractions
     * @return {Object}
     *    The vertical offsets of the numerator (u), the denominator (v),
     *    the separation between the two, and the bboxes themselves.
     */
     getUVQ(display) {
      const nbox = this.childNodes[0].getBBox() ;
      const dbox = this.childNodes[1].getBBox() ;
      const tex = this.font.params;
      //
      //  Initial offsets (u, v)
      //  Minimum separation (p)
      //  Actual separation with initial positions (q)
      //
      let [u, v] = (display ? [tex.num1, tex.denom1] : [tex.num3, tex.denom2]);
      let p = (display ? 7 : 3) * tex.rule_thickness;
      let q = (u - nbox.d * nbox.scale) - (dbox.h * dbox.scale - v);
      //
      //  If actual separation is less than minimum, move them farther apart
      //
      if (q < p) {
        u += (p - q) / 2;
        v += (p - q) / 2;
        q = p;
      }
      return {u, v, q, nbox, dbox};
    }

    /************************************************/

    /**
     * @param {BBox} bbox        The boundng box to modify
     * @param {boolean} display  True for display-mode fractions
     */
     getBevelledBBox(bbox, display) {
      const {u, v, delta, nbox, dbox} = this.getBevelData(display);
      const lbox = this.bevel.getBBox();
      bbox.combine(nbox, 0, u);
      bbox.combine(lbox, bbox.w - delta / 2, 0);
      bbox.combine(dbox, bbox.w - delta / 2, v);
    }

    /**
     * @param {boolean} display  True for display-style fractions
     * @return {Object}          The height (H) of the bevel, horizontal offest (delta)
     *                             vertical offsets (u and v) of the parts, and
     *                             bounding boxes of the parts.
     */
     getBevelData(display)

 {
      const nbox = this.childNodes[0].getBBox() ;
      const dbox = this.childNodes[1].getBBox() ;
      const delta = (display ? .4 : .15);
      const H = Math.max(nbox.scale * (nbox.h + nbox.d), dbox.scale * (dbox.h + dbox.d)) + 2 * delta;
      const a = this.font.params.axis_height;
      const u = nbox.scale * (nbox.d - nbox.h) / 2 + a + delta;
      const v = dbox.scale * (dbox.d - dbox.h) / 2 + a - delta;
      return {H, delta, u, v, nbox, dbox};
    }

    /************************************************/

    /**
     * @override
     */
     canStretch(_direction) {
      return false;
    }

    /**
     * @return {boolean}   True if in display mode, false otherwise
     */
     isDisplay() {
      const {displaystyle, scriptlevel} = this.node.attributes.getList('displaystyle', 'scriptlevel');
      return displaystyle && scriptlevel === 0;
    }

    /**
     * @override
     */
     getWrapWidth(i) {
      const attributes = this.node.attributes;
      if (attributes.get('bevelled')) {
        return this.childNodes[i].getBBox().w;
      }
      const w = this.getBBox().w;
      const thickness = this.length2em(attributes.get('linethickness'));
      return w - (thickness ? .2 : 0) -  2 * this.pad;
    }

    /**
     * @override
     */
     getChildAlign(i) {
      const attributes = this.node.attributes;
      return (attributes.get('bevelled') ? 'left' : attributes.get(['numalign', 'denomalign'][i]) );
    }

  }, _class$5);

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */




/*****************************************************************/
/**
 * The CHTMLmfrac wrapper for the MmlMfrac object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLmfrac extends CommonMfracMixin(CHTMLWrapper) {

  /**
   * The mfrac wrapper
   */
   static __initStatic() {this.kind = MmlMfrac.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-frac': {
      display: 'inline-block',
      'vertical-align': '0.17em',  // axis_height - 1.5 * rule_thickness
      padding: '0 .22em'           // nulldelimiterspace + .1 (for line's -.1em margin)
    },
    'mjx-frac[type="d"]': {
      'vertical-align': '.04em'    // axis_height - 3.5 * rule_thickness
    },
    'mjx-frac[delims]': {
      padding: '0 .1em'            // .1 (for line's -.1em margin)
    },
    'mjx-frac[atop]': {
      padding: '0 .12em'           // nulldelimiterspace
    },
    'mjx-frac[atop][delims]': {
      padding: '0'
    },
    'mjx-dtable': {
      display: 'inline-table',
      width: '100%'
    },
    'mjx-dtable > *': {
      'font-size': '2000%'
    },
    'mjx-dbox': {
      display: 'block',
      'font-size': '5%'
    },
    'mjx-num': {
      display: 'block',
      'text-align': 'center'
    },
    'mjx-den': {
      display: 'block',
      'text-align': 'center'
    },
    'mjx-mfrac[bevelled] > mjx-num': {
      display: 'inline-block'
    },
    'mjx-mfrac[bevelled] > mjx-den': {
      display: 'inline-block'
    },

    'mjx-den[align="right"], mjx-num[align="right"]': {
      'text-align': 'right'
    },
    'mjx-den[align="left"], mjx-num[align="left"]': {
      'text-align': 'left'
    },

    'mjx-nstrut': {
      display: 'inline-block',
      height: '.054em',              // num2 - a - 1.5t
      width: 0,
      'vertical-align': '-.054em'    // ditto
    },
    'mjx-nstrut[type="d"]': {
      height: '.217em',              // num1 - a - 3.5t
      'vertical-align': '-.217em',   // ditto
    },
    'mjx-dstrut': {
      display: 'inline-block',
      height: '.505em',              // denom2 + a - 1.5t
      width: 0
    },
    'mjx-dstrut[type="d"]': {
      height: '.726em',              // denom1 + a - 3.5t
    },

    'mjx-line': {
      display: 'block',
      'box-sizing': 'border-box',
      'min-height': '1px',
      height: '.06em',               // t = rule_thickness
      'border-top': '.06em solid',   // t
      margin: '.06em -.1em',         // t
      overflow: 'hidden'
    },
    'mjx-line[type="d"]': {
      margin: '.18em -.1em'          // 3t
    }

  };}

  /**
   * An mop element to use for bevelled fractions
   */
  

  /************************************************/

  /**
   * @override
   */
   toCHTML(parent) {
    this.standardCHTMLnode(parent);
    const {linethickness, bevelled} = this.node.attributes.getList('linethickness', 'bevelled');
    const display = this.isDisplay();
    if (bevelled) {
      this.makeBevelled(display);
    } else {
      const thickness = this.length2em(String(linethickness), .06);
      if (thickness === 0) {
        this.makeAtop(display);
      } else {
        this.makeFraction(display, thickness);
      }
    }
  }

  /************************************************/

  /**
   * @param {boolean} display  True when fraction is in display mode
   * @param {number} t         The rule line thickness
   */
   makeFraction(display, t) {
    const {numalign, denomalign} = this.node.attributes.getList('numalign', 'denomalign');
    const withDelims = this.node.getProperty('withDelims');
    //
    // Attributes to set for the different elements making up the fraction
    //
    const attr = (display ? {type: 'd'} : {}) ;
    const fattr = (withDelims ? {...attr, delims: 'true'} : {...attr}) ;
    const nattr = (numalign !== 'center' ? {align: numalign} : {}) ;
    const dattr = (denomalign !== 'center' ? {align: denomalign} : {}) ;
    const dsattr = {...attr}, nsattr = {...attr};
    //
    // Set the styles to handle the linethickness, if needed
    //
    const tex = this.font.params;
    if (t !== .06) {
      const a = tex.axis_height;
      const tEm = this.em(t);
      const {T, u, v} = this.getTUV(display, t);
      const m = (display ? this.em(3 * t) : tEm) + ' -.1em';
      attr.style = {height: tEm, 'border-top': tEm + ' solid', margin: m};
      const nh = this.em(Math.max(0, u));
      nsattr.style = {height: nh, 'vertical-align': '-' + nh};
      dsattr.style = {height: this.em(Math.max(0, v))};
      fattr.style  = {'vertical-align': this.em(a - T)};
    }
    //
    // Create the DOM tree
    //
    let num, den;
    this.adaptor.append(this.chtml, this.html('mjx-frac', fattr, [
      num = this.html('mjx-num', nattr, [this.html('mjx-nstrut', nsattr)]),
      this.html('mjx-dbox', {}, [
        this.html('mjx-dtable', {}, [
          this.html('mjx-line', attr),
          this.html('mjx-row', {}, [
            den = this.html('mjx-den', dattr, [this.html('mjx-dstrut', dsattr)])
          ])
        ])
      ])
    ]));
    this.childNodes[0].toCHTML(num);
    this.childNodes[1].toCHTML(den);
  }

  /************************************************/

  /**
   * @param {boolean} display  True when fraction is in display mode
   */
   makeAtop(display) {
    const {numalign, denomalign} = this.node.attributes.getList('numalign', 'denomalign');
    const withDelims = this.node.getProperty('withDelims');
    //
    // Attributes to set for the different elements making up the fraction
    //
    const attr = (display ? {type: 'd', atop: true} : {atop: true}) ;
    const fattr = (withDelims ? {...attr, delims: true} : {...attr}) ;
    const nattr = (numalign !== 'center' ? {align: numalign} : {}) ;
    const dattr = (denomalign !== 'center' ? {align: denomalign} : {}) ;
    //
    // Determine sparation and positioning
    //
    const {v, q} = this.getUVQ(display);
    nattr.style = {'padding-bottom': this.em(q)};
    fattr.style = {'vertical-align': this.em(-v)};
    //
    // Create the DOM tree
    //
    let num, den;
    this.adaptor.append(this.chtml, this.html('mjx-frac', fattr, [
      num = this.html('mjx-num', nattr),
      den = this.html('mjx-den', dattr)
    ]));
    this.childNodes[0].toCHTML(num);
    this.childNodes[1].toCHTML(den);
  }

  /************************************************/

  /**
   * @param {boolean} display  True when fraction is in display mode
   */
   makeBevelled(display) {
    const adaptor = this.adaptor;
    //
    //  Create HTML tree
    //
    adaptor.setAttribute(this.chtml, 'bevelled', 'ture');
    const num = adaptor.append(this.chtml, this.html('mjx-num'));
    this.childNodes[0].toCHTML(num);
    this.bevel.toCHTML(this.chtml);
    const den = adaptor.append(this.chtml, this.html('mjx-den'));
    this.childNodes[1].toCHTML(den);
    //
    //  Place the parts
    //
    const {u, v, delta, nbox, dbox} = this.getBevelData(display);
    if (u) {
      adaptor.setStyle(num, 'verticalAlign', this.em(u / nbox.scale));
    }
    if (v) {
      adaptor.setStyle(den, 'verticalAlign', this.em(v / dbox.scale));
    }
    const dx = this.em(-delta / 2);
    adaptor.setStyle(this.bevel.chtml, 'marginLeft', dx);
    adaptor.setStyle(this.bevel.chtml, 'marginRight', dx);
  }

} CHTMLmfrac.__initStatic(); CHTMLmfrac.__initStatic2();

/*****************************************************************/
/**
 * The CommonMsqrt interface
 */


















































/*****************************************************************/
/**
 * The CommonMsqrt wrapper mixin for the MmlMsqrt object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMsqrtMixin(Base) {

  return class extends Base {

    /**
     * @return {number}  The index of the base of the root in childNodes
     */
    get base() {
      return 0;
    }

    /**
     * @return {number}  The index of the surd in childNodes
     */
    get surd() {
      return 1;
    }

    /**
     * @return {number}  The index of the root in childNodes (or null if none)
     */
    get root() {
      return null;
    }

    /**
     * The requested height of the stretched surd character
     */
    

    /**
     * Add the surd character so we can display it later
     *
     * @override
     */
    constructor(...args) {
      super(...args);
      const surd = this.createMo('\u221A');
      surd.canStretch(DIRECTION.Vertical);
      const {h, d} = this.childNodes[this.base].getBBox();
      const t = this.font.params.rule_thickness;
      const p = (this.node.attributes.get('displaystyle') ? this.font.params.x_height : t);
      this.surdH = h + d + 2 * t + p / 4;
      (surd ).getStretchedVariant([this.surdH - d, d], true);
    }

    /**
     * @override
     */
     createMo(text) {
      const node = super.createMo(text);
      this.childNodes.push(node);
      return node;
    }

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      const surdbox = this.childNodes[this.surd].getBBox();
      const basebox = new BBox(this.childNodes[this.base].getBBox());
      const q = this.getPQ(surdbox)[1];
      const t = this.font.params.rule_thickness;
      const H = basebox.h + q + t;
      const [x] = this.getRootDimens(surdbox, H);
      bbox.h = H + t;
      this.combineRootBBox(bbox, surdbox, H);
      bbox.combine(surdbox, x, H - surdbox.h);
      bbox.combine(basebox, x + surdbox.w, 0);
      bbox.clean();
      this.setChildPWidths(recompute);
    }

    /**
     * Combine the bounding box of the root (overridden in mroot)
     *
     * @param {BBox} bbox  The bounding box so far
     * @param {BBox} sbox  The bounding box of the surd
     * @param {number} H   The height of the root as a whole
     */
     combineRootBBox(_bbox, _sbox, _H) {
    }

    /**
     * @param {BBox} sbox  The bounding box for the surd character
     * @return {[number, number]}  The p, q, and x values for the TeX layout computations
     */
     getPQ(sbox) {
      const t = this.font.params.rule_thickness;
      const p = (this.node.attributes.get('displaystyle') ? this.font.params.x_height : t);
      const q = (sbox.h + sbox.d > this.surdH ?
                 ((sbox.h + sbox.d) - (this.surdH - 2 * t - p / 2)) / 2 :
                 t + p / 4);
      return [p, q];
    }

    /**
     * @param {BBox} sbox  The bounding box of the surd
     * @param {number} H   The height of the root as a whole
     * @return {[number, number, number, number]} The x offset of the surd, and
     *     the height, x offset, and scale of the root
     */
     getRootDimens(_sbox, _H) {
      return [0, 0, 0, 0];
    }

  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 * The CHTMLmsqrt wrapper for the MmlMsqrt object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLmsqrt extends CommonMsqrtMixin(CHTMLWrapper) {

  /**
   * The msqrt wrapper
   */
   static __initStatic() {this.kind = MmlMsqrt.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-root': {
      display: 'inline-block',
      'white-space': 'nowrap'
    },
    'mjx-surd': {
      display: 'inline-block',
      'vertical-align': 'top'
    },
    'mjx-sqrt': {
      display: 'inline-block',
      'padding-top': '.07em'
    },
    'mjx-sqrt > mjx-box': {
      'border-top': '.07em solid'
    },
    'mjx-sqrt.mjx-tall > mjx-box': {
      'padding-left': '.3em',
      'margin-left': '-.3em'
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    const surd = this.childNodes[this.surd] ;
    const base = this.childNodes[this.base];
    //
    //  Get the parameters for the spacing of the parts
    //
    const sbox = surd.getBBox();
    const bbox = base.getBBox();
    const [ , q] = this.getPQ(sbox);
    const t = this.font.params.rule_thickness;
    const H = bbox.h + q + t;
    //
    //  Create the HTML structure for the root
    //
    const CHTML = this.standardCHTMLnode(parent);
    let SURD, BASE, ROOT, root;
    if (this.root != null) {
      ROOT = this.adaptor.append(CHTML, this.html('mjx-root')) ;
      root = this.childNodes[this.root];
    }
    const SQRT = this.adaptor.append(CHTML, this.html('mjx-sqrt', {}, [
      SURD = this.html('mjx-surd'),
      BASE = this.html('mjx-box', {style: {paddingTop: this.em(q)}})
    ])) ;
    //
    //  Add the child content
    //
    this.addRoot(ROOT, root, sbox, H);
    surd.toCHTML(SURD);
    base.toCHTML(BASE);
    if (surd.size < 0) {
      //
      // size < 0 means surd is multi-character.  The angle glyph at the
      // top is hard to align with the horizontal line, so overlap them
      // using CSS.
      //
      this.adaptor.addClass(SQRT, 'mjx-tall');
    }
  }

  /**
   * Add root HTML (overridden in mroot)
   *
   * @param {N} ROOT             The container for the root
   * @param {CHTMLWrapper} root  The wrapped MML root content
   * @param {BBox} sbox          The bounding box of the surd
   * @param {number} H           The height of the root as a whole
   */
   addRoot(_ROOT, _root, _sbox, _H) {
  }

} CHTMLmsqrt.__initStatic(); CHTMLmsqrt.__initStatic2();

/*****************************************************************/
/**
 * The CommonMroot interface
 */








/*****************************************************************/
/**
 * The CommonMroot wrapper mixin for the MmlMroot object (extends CommonMsqrt)
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMrootMixin(Base) {

  return class extends Base {

    /**
     * @override
     */
    get surd() {
      return 2;
    }

    /**
     * @override
     */
    get root() {
      return 1;
    }

    /**
     * @override
     */
     combineRootBBox(BBOX, sbox, H) {
      const bbox = this.childNodes[this.root].getBBox();
      const h = this.getRootDimens(sbox, H)[1];
      BBOX.combine(bbox, 0, h);
    }

    /**
     * @override
     */
     getRootDimens(sbox, H) {
      const surd = this.childNodes[this.surd] ;
      const bbox = this.childNodes[this.root].getBBox();
      const offset = (surd.size < 0 ? .5 : .6) * sbox.w;
      const {w, rscale} = bbox;
      const W = Math.max(w, offset / rscale);
      const dx = Math.max(0, W - w);
      const h = this.rootHeight(bbox, sbox, surd.size, H);
      const x = W * rscale - offset;
      return [x, h, dx];
    }

    /**
     * @param {BBox} rbox      The bbox of the root
     * @param {BBox} sbox      The bbox of the surd
     * @param {number} size    The size of the surd
     * @param {number} H       The height of the root as a whole
     * @return {number}        The height of the root within the surd
     */
     rootHeight(rbox, sbox, size, H) {
      const h = sbox.h + sbox.d;
      const b = (size < 0 ? 1.9 : .55 * h) - (h - H);
      return b + Math.max(0, rbox.d * rbox.rscale);
    }

  };

}

/*****************************************************************/
/**
 * The CHTMLmroot wrapper for the MmlMroot object (extends CHTMLmsqrt)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLmroot extends CommonMrootMixin(CHTMLmsqrt) {

  /**
   * The mroot wrapper
   */
   static __initStatic() {this.kind = MmlMroot.prototype.kind;}

  /**
   * @override
   */
   addRoot(ROOT, root, sbox, H) {
    root.toCHTML(ROOT);
    const [x, h, dx] = this.getRootDimens(sbox, H);
    this.adaptor.setStyle(ROOT, 'verticalAlign', this.em(h));
    this.adaptor.setStyle(ROOT, 'width', this.em(x));
    if (dx) {
      this.adaptor.setStyle(this.adaptor.firstChild(ROOT) , 'paddingLeft', this.em(dx));
    }
  }

} CHTMLmroot.__initStatic();

var _class$6;

/*
 * Mutliply italic correction by this much (improve horizontal shift for italic characters)
 */
const DELTA = 1.5;

/*****************************************************************/
/**
 * The CommonScriptbase interface
 *
 * @template W  The child-node Wrapper class
 */































































































































/*****************************************************************/
/**
 * A base class for msup/msub/msubsup and munder/mover/munderover
 * wrapper mixin implementations
 *
 * @template W  The child-node Wrapper class
 * @template T  The Wrapper class constructor type
 */
function CommonScriptbaseMixin


(Base) {

  return (_class$6 = class extends Base {

    /**
     * Set to true for munderover/munder/mover/msup (Appendix G 13)
     */
     static __initStatic() {this.useIC = false;}

    /**
     * The core mi or mo of the base (or the base itself if there isn't one)
     */
    

    /**
     * @return {W}  The base element's wrapper
     */
     get baseChild() {
      return this.childNodes[(this.node ).base];
    }

    /**
     * @return {W}  The script element's wrapper (overridden in subclasses)
     */
     get script() {
      return this.childNodes[1];
    }

    /**
     * @override
     */
    constructor(...args) {
      super(...args);
      //
      //  Find the base core
      //
      let core = this.baseCore = this.childNodes[0];
      if (!core) return;
      while (core.childNodes.length === 1 &&
             (core.node.isKind('mrow') || core.node.isKind('TeXAtom') ||
              core.node.isKind('mstyle') || core.node.isKind('mpadded') ||
              core.node.isKind('mphantom') || core.node.isKind('semantics'))) {
        core = core.childNodes[0];
        if (!core) return;
      }
      if (!('noIC' in core)) return;
      this.baseCore = core;
      //
      //  Check if the base is a mi or mo that needs italic correction removed
      //
      if (!(this.constructor ).useIC) {
        (core ).noIC = true;
      }
    }

    /**
     * This gives the common bbox for msub and msup.  It is overridden
     * for all the others (msubsup, munder, mover, munderover).
     *
     * @override
     */
     computeBBox(bbox, recompute = false) {
      const basebox = this.baseChild.getBBox();
      const scriptbox = this.script.getBBox();
      const [x, y] = this.getOffset(basebox, scriptbox);
      bbox.append(basebox);
      bbox.combine(scriptbox, bbox.w + x, y);
      bbox.w += this.font.params.scriptspace;
      bbox.clean();
      this.setChildPWidths(recompute);
    }

    /**
     * @return {number}  The ic for the core element
     */
     coreIC() {
      const corebox = this.baseCore.getBBox();
      return (corebox.ic ? 1.05 * corebox.ic + .05 : 0);
    }

    /**
     * @return {number}   The relative scaling of the base
     */
     coreScale() {
      let scale = this.baseChild.getBBox().rscale;
      let base = this.baseChild;
      while ((base.node.isKind('mstyle') || base.node.isKind('mrow') || base.node.isKind('TeXAtom'))
             && base.childNodes.length === 1) {
        base = base.childNodes[0];
        scale *= base.getBBox().rscale;
      }
      return scale;
    }

    /**
     * @return {boolean}  True if the base is an mi, mn, or mo (not a largeop) consisting of a single character
     */
     isCharBase() {
      let base = this.baseChild;
      while ((base.node.isKind('mstyle') || base.node.isKind('mrow')) && base.childNodes.length === 1) {
        base = base.childNodes[0];
      }
      return ((base.node.isKind('mo') || base.node.isKind('mi') || base.node.isKind('mn')) &&
              base.bbox.rscale === 1 && Array.from(base.getText()).length === 1 &&
              !base.node.attributes.get('largeop'));
    }

    /***************************************************************************/
    /*
     *  Methods for sub-sup nodes
     */

    /**
     * Get the shift for the script (implemented in subclasses)
     *
     * @param {BBox} bbox   The bounding box of the base element
     * @param {BBox} sbox   The bounding box of the script element
     * @return {[number, number]}   The horizontal and vertical offsets for the script
     */
     getOffset(_bbox, _sbox) {
      return [0, 0];
    }

    /**
     * Get the shift for a subscript (TeXBook Appendix G 18ab)
     *
     * @param {BBox} bbox   The bounding box of the base element
     * @param {BBox} sbox   The bounding box of the superscript element
     * @return {number}     The vertical offset for the script
     */
     getV(bbox, sbox) {
      const tex = this.font.params;
      const subscriptshift = this.length2em(this.node.attributes.get('subscriptshift'), tex.sub1);
      return Math.max(
        this.isCharBase() ? 0 : bbox.d * bbox.rscale + tex.sub_drop * sbox.rscale,
        subscriptshift,
        sbox.h * sbox.rscale - (4 / 5) * tex.x_height
      );
    }

    /**
     * Get the shift for a superscript (TeXBook Appendix G 18acd)
     *
     * @param {BBox} bbox   The bounding box of the base element
     * @param {BBox} sbox   The bounding box of the superscript element
     * @return {number}     The vertical offset for the script
     */
     getU(bbox, sbox) {
      const tex = this.font.params;
      const attr = this.node.attributes.getList('displaystyle', 'superscriptshift');
      const prime = this.node.getProperty('texprimestyle');
      const p = prime ? tex.sup3 : (attr.displaystyle ? tex.sup1 : tex.sup2);
      const superscriptshift = this.length2em(attr.superscriptshift, p);
      return Math.max(
        this.isCharBase() ? 0 : bbox.h * bbox.rscale - tex.sup_drop * sbox.rscale,
        superscriptshift,
        sbox.d * sbox.rscale + (1 / 4) * tex.x_height
      );
    }

    /***************************************************************************/
    /*
     *  Methods for under-over nodes
     */

    /**
     * @return {boolean}  True if the base has movablelimits (needed by munderover)
     */
     hasMovableLimits() {
      const display = this.node.attributes.get('displaystyle');
      const mo = this.baseChild.coreMO().node;
      return (!display && !!mo.attributes.get('movablelimits'));
    }

    /**
     * Get the separation and offset for overscripts (TeXBoox Appendix G 13, 13a)
     *
     * @param {BBox} basebox  The bounding box of the base
     * @param {BBox} overbox  The bounding box of the overscript
     * @return {[number, number]}     The separation between their boxes, and the offset of the overscript
     */
     getOverKU(basebox, overbox) {
      const accent = this.node.attributes.get('accent') ;
      const tex = this.font.params;
      const d = overbox.d * overbox.rscale;
      const k = (accent ? tex.rule_thickness :
                 Math.max(tex.big_op_spacing1, tex.big_op_spacing3 - Math.max(0, d))) -
        (this.baseChild.node.isKind('munderover') ? .1 : 0);
      return [k, basebox.h * basebox.rscale + k + d];
    }

    /**
     * Get the separation and offset for underscripts (TeXBoox Appendix G 13, 13a)
     *
     * @param {BBox} basebox   The bounding box of the base
     * @param {BBox} underbox  The bounding box of the underscript
     * @return {[number, number]}      The separation between their boxes, and the offset of the underscript
     */
     getUnderKV(basebox, underbox) {
      const accent = this.node.attributes.get('accentunder') ;
      const tex = this.font.params;
      const h = underbox.h * underbox.rscale;
      const k = (accent ? tex.rule_thickness :
                 Math.max(tex.big_op_spacing2, tex.big_op_spacing4 - h)) -
        (this.baseChild.node.isKind('munderover') ? .1 : 0);
      return [k, -(basebox.d * basebox.rscale + k + h)];
    }

    /**
     * @param {BBox[]} boxes     The bounding boxes whose offsets are to be computed
     * @param {number[]=} delta  The initial x offsets of the boxes
     * @return {number[]}        The actual offsets needed to center the boxes in the stack
     */
     getDeltaW(boxes, delta = [0, 0, 0]) {
      const align = this.node.attributes.get('align');
      const widths = boxes.map(box => box.w * box.rscale);
      const w = Math.max(...widths);
      const dw = [];
      let m = 0;
      for (const i of widths.keys()) {
        dw[i] = (align === 'center' ? (w - widths[i]) / 2 :
                 align === 'right' ? w - widths[i] : 0) + delta[i];
        if (dw[i] < m) {
          m = -dw[i];
        }
      }
      if (m) {
        for (const i of dw.keys()) {
          dw[i] += m;
        }
      }
      return dw;
    }

    /**
     * @param {boolean=} noskew   Whether to ignore the skew amount
     * @return {number}           The offset for under and over
     */
     getDelta(noskew = false) {
      const accent = this.node.attributes.get('accent');
      const ddelta = (accent && !noskew ? this.baseChild.coreMO().bbox.sk : 0);
      return (DELTA * this.baseCore.bbox.ic / 2 + ddelta) * this.coreScale();
    }

    /**
     * Handle horizontal stretching of children to match greatest width
     *  of all children
     */
     stretchChildren() {
      let stretchy = [];
      //
      //  Locate and count the stretchy children
      //
      for (const child of this.childNodes) {
        if (child.canStretch(DIRECTION.Horizontal)) {
          stretchy.push(child);
        }
      }
      let count = stretchy.length;
      let nodeCount = this.childNodes.length;
      if (count && nodeCount > 1) {
        let W = 0;
        //
        //  If all the children are stretchy, find the largest one,
        //  otherwise, find the width of the non-stretchy children.
        //
        let all = (count > 1 && count === nodeCount);
        for (const child of this.childNodes) {
          const noStretch = (child.stretch.dir === DIRECTION.None);
          if (all || noStretch) {
            const {w, rscale} = child.getBBox(noStretch);
            if (w * rscale > W) W = w * rscale;
          }
        }
        //
        //  Stretch the stretchable children
        //
        for (const child of stretchy) {
          (child.coreMO() ).getStretchedVariant([W / child.bbox.rscale]);
        }
      }
    }

  }, _class$6.__initStatic(), _class$6);

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */



/*****************************************************************/
/**
 * A base class for msup/msub/msubsup and munder/mover/munderover
 * wrapper implementations
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLscriptbase extends
CommonScriptbaseMixin(CHTMLWrapper) {

  /**
   * The scriptbase wrapper
   */
   static __initStatic() {this.kind = 'scriptbase';}

  /**
   * Set to true for munderover/munder/mover/msup (Appendix G 13)
   */
   static __initStatic2() {this.useIC = false;}

  /**
   * This gives the common output for msub and msup.  It is overridden
   * for all the others (msubsup, munder, mover, munderover).
   *
   * @override
   */
   toCHTML(parent) {
    this.chtml = this.standardCHTMLnode(parent);
    const [x, v] = this.getOffset(this.baseChild.getBBox(), this.script.getBBox());
    const style = {'vertical-align': this.em(v)};
    if (x) {
      style['margin-left'] = this.em(x);
    }
    this.baseChild.toCHTML(this.chtml);
    this.script.toCHTML(this.adaptor.append(this.chtml, this.html('mjx-script', {style})) );
  }

  /**
   * @param {N[]} nodes    The HTML elements to be centered in a stack
   * @param {number[]} dx  The x offsets needed to center the elements
   */
   setDeltaW(nodes, dx) {
    for (let i = 0; i < dx.length; i++) {
      if (dx[i]) {
        this.adaptor.setStyle(nodes[i], 'paddingLeft', this.em(dx[i]));
      }
    }
  }

  /**
   * @param {N} over        The HTML element for the overscript
   * @param {BBox} overbox  The bbox for the overscript
   */
   adjustOverDepth(over, overbox) {
    if (overbox.d >= 0) return;
    this.adaptor.setStyle(over, 'marginBottom', this.em(overbox.d * overbox.rscale));
  }

  /**
   * @param {N} under        The HTML element for the underscript
   * @param {BBox} underbox  The bbox for the underscript
   */
   adjustUnderDepth(under, underbox) {
    if (underbox.d >= 0) return;
    const adaptor = this.adaptor;
    const v = this.em(underbox.d);
    const box = this.html('mjx-box', {style: {'margin-bottom': v, 'vertical-align': v}});
    for (const child of adaptor.childNodes(adaptor.firstChild(under) ) ) {
      adaptor.append(box, child);
    }
    adaptor.append(adaptor.firstChild(under) , box);
  }

} CHTMLscriptbase.__initStatic(); CHTMLscriptbase.__initStatic2();

var _class$7;




























/*****************************************************************/
/**
 * The CommonMsub interface
 *
 * @template W  The child-node Wrapper class
 */










/*****************************************************************/
/**
 * The CommonMsub wrapper mixin for the MmlMsub object
 *
 * @template W  The child-node Wrapper class
 * @template T  The Wrapper class constructor type
 */
function CommonMsubMixin


(Base) {

  return class extends Base {

    /**
     * @override
     */
     get script() {
      return this.childNodes[(this.node ).sub];
    }

    /**
     * Get the shift for the subscript
     *
     * @override
     */
     getOffset(bbox, sbox) {
      return [0, -this.getV(bbox, sbox)];
    }

  };

}

/*****************************************************************/
/**
 * The CommonMsup interface
 *
 * @template W  The child-node Wrapper class
 */










/*****************************************************************/
/**
 * The CommonMsup wrapper mixin for the MmlMsup object
 *
 * @template W  The child-node Wrapper class
 * @template T  The Wrapper class constructor type
 */
function CommonMsupMixin


(Base) {

  return class extends Base {

    /**
     * @override
     */
     get script() {
      return this.childNodes[(this.node ).sup];
    }

    /**
     * Get the shift for the superscript
     *
     * @override
     */
     getOffset(bbox, sbox) {
      const x = (this.baseCore.bbox.ic ? .05 * this.baseCore.bbox.ic + .05 : 0);
      return [x * this.coreScale(), this.getU(bbox, sbox)];
    }

  };

}

/*****************************************************************/
/**
 * The CommonMsubsup interface
 *
 * @template W  The child-node Wrapper class
 */




































/*****************************************************************/
/**
 * The CommomMsubsup wrapper for the MmlMsubsup object
 *
 * @template W  The child-node Wrapper class
 * @template T  The Wrapper class constructor type
 */
function CommonMsubsupMixin


(Base) {

  return (_class$7 = class extends Base {constructor(...args) { super(...args); _class$7.prototype.__init.call(this); }

    /**
     *  Cached values for the script offsets and separation (so if they are
     *  computed in computeBBox(), they don't have to be recomputed during output)
     */
     __init() {this.UVQ = null;}

    /**
     * @return {W}  The wrapper for the subscript
     */
     get subChild() {
      return this.childNodes[(this.node ).sub];
    }

    /**
     * @return {W}  The wrapper for the superscript
     */
     get supChild() {
      return this.childNodes[(this.node ).sup];
    }

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      const basebox = this.baseChild.getBBox();
      const subbox  = this.subChild.getBBox();
      const supbox  = this.supChild.getBBox();
      bbox.empty();
      bbox.append(basebox);
      const w = bbox.w;
      const [u, v] = this.getUVQ(basebox, subbox, supbox);
      const x = (this.baseCore.bbox.ic ? this.coreIC() * this.coreScale() : 0);
      bbox.combine(subbox, w, v);
      bbox.combine(supbox, w + x, u);
      bbox.w += this.font.params.scriptspace;
      bbox.clean();
      this.setChildPWidths(recompute);
    }

    /**
     * Get the shift for the scripts and their separation (TeXBook Appendix G 18adef)
     *
     * @param {BBox} basebox    The bounding box of the base
     * @param {BBox} subbox     The bounding box of the superscript
     * @param {BBox} supbox     The bounding box of the subscript
     * @return {number[]}       The vertical offsets for super and subscripts, and the space between them
     */
     getUVQ(basebox, subbox, supbox) {
      if (this.UVQ) return this.UVQ;
      const tex = this.font.params;
      const t = 3 * tex.rule_thickness;
      const subscriptshift = this.length2em(this.node.attributes.get('subscriptshift'), tex.sub2);
      const drop = (this.isCharBase() ? 0 : basebox.d * basebox.rscale + tex.sub_drop * subbox.rscale);
      //
      // u and v are the veritcal shifts of the scripts, initially set to minimum values and then adjusted
      //
      let [u, v] = [this.getU(basebox, supbox), Math.max(drop, subscriptshift)];
      //
      // q is the space currently between the super- and subscripts.
      // If it is less than 3 rule thicknesses,
      //   increase the subscript offset to make the space 3 rule thicknesses
      //   If the bottom of the superscript is below 4/5 of the x-height
      //     raise both the super- and subscripts by the difference
      //     (make the bottom of the superscript be at 4/5 the x-height, and the
      //      subscript 3 rule thickness below that).
      //
      let q = (u - supbox.d * supbox.rscale) - (subbox.h * subbox.rscale - v);
      if (q < t) {
        v += t - q;
        const p = (4 / 5) * tex.x_height - (u - supbox.d * supbox.rscale);
        if (p > 0) {
          u += p;
          v -= p;
        }
      }
      //
      // Make sure the shifts are at least the minimum amounts and
      // return the shifts and the space between the scripts
      //
      u = Math.max(this.length2em(this.node.attributes.get('superscriptshift'), u), u);
      v = Math.max(this.length2em(this.node.attributes.get('subscriptshift'), v), v);
      q = (u - supbox.d * supbox.rscale) - (subbox.h * subbox.rscale - v);
      this.UVQ = [u, -v, q];
      return this.UVQ;
    }

  }, _class$7);

}

/*****************************************************************/
/**
 * The CHTMLmsub wrapper for the MmlMsub object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmsub extends
CommonMsubMixin(CHTMLscriptbase)  {

  /**
   * The msub wrapper
   */
   static __initStatic() {this.kind = MmlMsub.prototype.kind;}

  /**
   * don't include italic correction
   */
   static __initStatic2() {this.useIC = false;}

} CHTMLmsub.__initStatic(); CHTMLmsub.__initStatic2();

/*****************************************************************/
/**
 * The CHTMLmsup wrapper for the MmlMsup object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmsup extends
CommonMsupMixin(CHTMLscriptbase)  {

  /**
   * The msup wrapper
   */
   static __initStatic3() {this.kind = MmlMsup.prototype.kind;}

  /**
   * Use italic correction
   */
   static __initStatic4() {this.useIC = true;}

} CHTMLmsup.__initStatic3(); CHTMLmsup.__initStatic4();

/*****************************************************************/
/**
 * The CHTMLmsubsup wrapper for the MmlMsubsup object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmsubsup extends
CommonMsubsupMixin(CHTMLscriptbase)  {

  /**
   * The msubsup wrapper
   */
   static __initStatic5() {this.kind = MmlMsubsup.prototype.kind;}

  /**
   * @override
   */
   static __initStatic6() {this.styles = {
    'mjx-script': {
      display: 'inline-block',
      'padding-right': '.05em'   // scriptspace
    },
    'mjx-script > *': {
      display: 'block'
    }
  };}

  /**
   * Don't use italic correction
   */
   static __initStatic7() {this.useIC = false;}

  /**
   * Make sure styles get output when called from munderover with movable limits
   *
   * @override
   */
   markUsed() {
    super.markUsed();
    (CHTMLmsubsup ).used = true;
  }

  /**
   * @override
   */
   toCHTML(parent) {
    const chtml = this.standardCHTMLnode(parent);
    const [base, sup, sub] = [this.baseChild, this.supChild, this.subChild];
    const [ , v, q] = this.getUVQ(base.getBBox(), sub.getBBox(), sup.getBBox());
    const x = this.baseCore.bbox.ic ? this.coreIC() * this.coreScale() : 0;
    const style = {'vertical-align': this.em(v)};
    base.toCHTML(chtml);
    const stack = this.adaptor.append(chtml, this.html('mjx-script', {style})) ;
    sup.toCHTML(stack);
    this.adaptor.append(stack, this.html('mjx-spacer', {style: {'margin-top': this.em(q)}}));
    sub.toCHTML(stack);
    const corebox = this.baseCore.bbox;
    if (corebox.ic) {
      this.adaptor.setStyle(sup.chtml, 'marginLeft', this.em(x / sup.bbox.rscale));
    }
  }

} CHTMLmsubsup.__initStatic5(); CHTMLmsubsup.__initStatic6(); CHTMLmsubsup.__initStatic7();

/*****************************************************************/
/**
 * The CommonMunder interface
 *
 * @template W  The child-node Wrapper class
 */










/*****************************************************************/
/**
 * The CommonMunder wrapper mixin for the MmlMunder object
 *
 * @template W  The child-node Wrapper class
 * @template T  The Wrapper class constructor type
 */
function CommonMunderMixin


(Base) {

  return class extends Base {

    /**
     * @override
     */
     get script() {
      return this.childNodes[(this.node ).under];
    }

    /**
     * @override
     * @constructor
     */
    constructor(...args) {
      super(...args);
      this.stretchChildren();
    }

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      if (this.hasMovableLimits()) {
        super.computeBBox(bbox, recompute);
        return;
      }
      bbox.empty();
      const basebox = this.baseChild.getBBox();
      const underbox = this.script.getBBox();
      const v = this.getUnderKV(basebox, underbox)[1];
      const delta = this.getDelta(true);
      const [bw, uw] = this.getDeltaW([basebox, underbox], [0, -delta]);
      bbox.combine(basebox, bw, 0);
      bbox.combine(underbox, uw, v);
      bbox.d += this.font.params.big_op_spacing5;
      bbox.ic = -this.baseCore.bbox.ic;
      bbox.clean();
      this.setChildPWidths(recompute);
    }

  };

}

/*****************************************************************/
/**
 * The CommonMover interface
 *
 * @template W  The child-node Wrapper class
 */










/*****************************************************************/
/**
 * The CommonMover wrapper mixin for the MmlMover object
 *
 * @template W  The child-node Wrapper class
 * @template T  The Wrapper class constructor type
 */
function CommonMoverMixin


(Base) {

  return class extends Base {

    /**
     * @override
     */
     get script() {
      return this.childNodes[(this.node ).over];
    }

    /**
     * @override
     * @constructor
     */
    constructor(...args) {
      super(...args);
      this.stretchChildren();
    }

    /**
     * @override
     */
     computeBBox(bbox) {
      if (this.hasMovableLimits()) {
        super.computeBBox(bbox);
        return;
      }
      bbox.empty();
      const basebox = this.baseChild.getBBox();
      const overbox = this.script.getBBox();
      const u = this.getOverKU(basebox, overbox)[1];
      const delta = this.getDelta();
      const [bw, ow] = this.getDeltaW([basebox, overbox], [0, delta]);
      bbox.combine(basebox, bw, 0);
      bbox.combine(overbox, ow, u);
      bbox.h += this.font.params.big_op_spacing5;
      bbox.ic = -this.baseCore.bbox.ic;
      bbox.clean();
    }

  };

}

/*****************************************************************/
/**
 * The CommonMunderover interface
 *
 * @template W  The child-node Wrapper class
 */





















/*****************************************************************/
/*
 * The CommonMunderover wrapper for the MmlMunderover object
 *
 * @template W  The child-node Wrapper class
 * @template T  The Wrapper class constructor type
 */
function CommonMunderoverMixin


(Base) {

  return class extends Base {

    /*
     * @return {W}   The wrapped under node
     */
     get underChild() {
      return this.childNodes[(this.node ).under];
    }

    /*
     * @return {W}   The wrapped overder node
     */
     get overChild() {
      return this.childNodes[(this.node ).over];
    }

    /*
     * Needed for movablelimits
     *
     * @override
     */
     get subChild() {
      return this.underChild;
    }

    /*
     * Needed for movablelimits
     *
     * @override
     */
     get supChild() {
      return this.overChild;
    }

    /**
     * @override
     * @constructor
     */
    constructor(...args) {
      super(...args);
      this.stretchChildren();
    }

    /**
     * @override
     */
     computeBBox(bbox) {
      if (this.hasMovableLimits()) {
        super.computeBBox(bbox);
        return;
      }
      bbox.empty();
      const overbox = this.overChild.getBBox();
      const basebox = this.baseChild.getBBox();
      const underbox = this.underChild.getBBox();
      const u = this.getOverKU(basebox, overbox)[1];
      const v = this.getUnderKV(basebox, underbox)[1];
      const delta = this.getDelta();
      const [bw, uw, ow] = this.getDeltaW([basebox, underbox, overbox], [0, -delta, delta]);
      bbox.combine(basebox, bw, 0);
      bbox.combine(overbox, ow, u);
      bbox.combine(underbox, uw, v);
      const z = this.font.params.big_op_spacing5;
      bbox.h += z;
      bbox.d += z;
      bbox.ic = -this.baseCore.bbox.ic;
      bbox.clean();
    }

  };

}

/*****************************************************************/
/**
 * The CHTMLmunder wrapper for the MmlMunder object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmunder extends
CommonMunderMixin(CHTMLmsub)  {

  /**
   * The munder wrapper
   */
   static __initStatic() {this.kind = MmlMunder.prototype.kind;}

  /**
   * Include italic correction
   */
   static __initStatic2() {this.useIC = true;}

  /**
   * @override
   */
   static __initStatic3() {this.styles = {
    'mjx-over': {
      'text-align': 'left'
    },
    'mjx-munder:not([limits="false"])': {
      display: 'inline-table',
    },
    'mjx-munder > mjx-row': {
      'text-align': 'left'
    },
    'mjx-under': {
      'padding-bottom': '.1em'           // big_op_spacing5
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    if (this.hasMovableLimits()) {
      super.toCHTML(parent);
      this.adaptor.setAttribute(this.chtml, 'limits', 'false');
      return;
    }
    this.chtml = this.standardCHTMLnode(parent);
    const base = this.adaptor.append(
      this.adaptor.append(this.chtml, this.html('mjx-row')) ,
      this.html('mjx-base')
    ) ;
    const under = this.adaptor.append(
      this.adaptor.append(this.chtml, this.html('mjx-row')) ,
      this.html('mjx-under')
    ) ;
    this.baseChild.toCHTML(base);
    this.script.toCHTML(under);
    const basebox = this.baseChild.getBBox();
    const underbox = this.script.getBBox();
    const k = this.getUnderKV(basebox, underbox)[0];
    const delta = this.getDelta(true);
    this.adaptor.setStyle(under, 'paddingTop', this.em(k));
    this.setDeltaW([base, under], this.getDeltaW([basebox, underbox], [0, -delta]));
    this.adjustUnderDepth(under, underbox);
  }

} CHTMLmunder.__initStatic(); CHTMLmunder.__initStatic2(); CHTMLmunder.__initStatic3();

/*****************************************************************/
/**
 * The CHTMLmover wrapper for the MmlMover object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmover extends
CommonMoverMixin(CHTMLmsup)  {

  /**
   * The mover wrapper
   */
   static __initStatic4() {this.kind = MmlMover.prototype.kind;}

  /**
   * Include italic correction
   */
   static __initStatic5() {this.useIC = true;}

  /**
   * @override
   */
   static __initStatic6() {this.styles = {
    'mjx-mover:not([limits="false"])': {
      'padding-top': '.1em'        // big_op_spacing5
    },
    'mjx-mover:not([limits="false"]) > *': {
      display: 'block',
      'text-align': 'left'
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    if (this.hasMovableLimits()) {
      super.toCHTML(parent);
      this.adaptor.setAttribute(this.chtml, 'limits', 'false');
      return;
    }
    this.chtml = this.standardCHTMLnode(parent);
    const over = this.adaptor.append(this.chtml, this.html('mjx-over')) ;
    const base = this.adaptor.append(this.chtml, this.html('mjx-base')) ;
    this.script.toCHTML(over);
    this.baseChild.toCHTML(base);
    const overbox = this.script.getBBox();
    const basebox = this.baseChild.getBBox();
    const k = this.getOverKU(basebox, overbox)[0];
    const delta = this.getDelta();
    this.adaptor.setStyle(over, 'paddingBottom', this.em(k));
    this.setDeltaW([base, over], this.getDeltaW([basebox, overbox], [0, delta]));
    this.adjustOverDepth(over, overbox);
  }

} CHTMLmover.__initStatic4(); CHTMLmover.__initStatic5(); CHTMLmover.__initStatic6();

/*****************************************************************/
/*
 * The CHTMLmunderover wrapper for the MmlMunderover object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmunderover extends
CommonMunderoverMixin(CHTMLmsubsup)  {

  /**
   * The munderover wrapper
   */
   static __initStatic7() {this.kind = MmlMunderover.prototype.kind;}

  /**
   * Include italic correction
   */
   static __initStatic8() {this.useIC = true;}

  /**
   * @override
   */
   static __initStatic9() {this.styles = {
    'mjx-munderover:not([limits="false"])': {
      'padding-top': '.1em'        // big_op_spacing5
    },
    'mjx-munderover:not([limits="false"]) > *': {
      display: 'block'
    },
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    if (this.hasMovableLimits()) {
      super.toCHTML(parent);
      this.adaptor.setAttribute(this.chtml, 'limits', 'false');
      return;
    }
    this.chtml = this.standardCHTMLnode(parent);
    const over = this.adaptor.append(this.chtml, this.html('mjx-over')) ;
    const table = this.adaptor.append(
      this.adaptor.append(this.chtml, this.html('mjx-box')) ,
      this.html('mjx-munder')
    ) ;
    const base = this.adaptor.append(
      this.adaptor.append(table, this.html('mjx-row')) ,
      this.html('mjx-base')
    ) ;
    const under = this.adaptor.append(
      this.adaptor.append(table, this.html('mjx-row')) ,
      this.html('mjx-under')
    ) ;
    this.overChild.toCHTML(over);
    this.baseChild.toCHTML(base);
    this.underChild.toCHTML(under);
    const overbox = this.overChild.getBBox();
    const basebox = this.baseChild.getBBox();
    const underbox = this.underChild.getBBox();
    const ok = this.getOverKU(basebox, overbox)[0];
    const uk = this.getUnderKV(basebox, underbox)[0];
    const delta = this.getDelta();
    this.adaptor.setStyle(over, 'paddingBottom', this.em(ok));
    this.adaptor.setStyle(under, 'paddingTop', this.em(uk));
    this.setDeltaW([base, under, over], this.getDeltaW([basebox, underbox, overbox], [0, -delta, delta]));
    this.adjustOverDepth(over, overbox);
    this.adjustUnderDepth(under, underbox);
  }

} CHTMLmunderover.__initStatic7(); CHTMLmunderover.__initStatic8(); CHTMLmunderover.__initStatic9();

var _class$8;

/*****************************************************************/

/**
 * The data about the scripts and base
 */























/**
 * The type of script that follows the given type
 */
const NextScript = {
  base: 'subList',
  subList: 'supList',
  supList: 'subList',
  psubList: 'psupList',
  psupList: 'psubList',
};

/*****************************************************************/
/**
 * The CommonMmultiscripts interface
 *
 * @template W  The child-node Wrapper class
 */



























































/*****************************************************************/
/**
 * The CommonMmultiscripts wrapper mixin for the MmlMmultiscripts object
 *
 * @template W  The child-node Wrapper class
 * @template T  The Wrapper class constructor type
 */
function CommonMmultiscriptsMixin


(Base) {

  return (_class$8 = class extends Base {constructor(...args) { super(...args); _class$8.prototype.__init.call(this);_class$8.prototype.__init2.call(this); }

    /**
     *  The cached data for the various bounding boxes
     */
     __init() {this.scriptData = null;}

    /**
     *  The index of the child following the <mprescripts/> tag
     */
     __init2() {this.firstPrescript = 0;}

    /*************************************************************/

    /**
     * @param {BBox} pre   The prescript bounding box
     * @param {BBox} post  The postcript bounding box
     * @return {BBox}      The combined bounding box
     */
     combinePrePost(pre, post) {
      const bbox = new BBox(pre);
      bbox.combine(post, 0, 0);
      return bbox;
    }

    /*************************************************************/

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      //
      // Get the bounding boxes, and combine the pre- and post-scripts
      //  to get a common offset for both
      //
      const scriptspace = this.font.params.scriptspace;
      const data = this.getScriptData();
      const sub = this.combinePrePost(data.sub, data.psub);
      const sup = this.combinePrePost(data.sup, data.psup);
      const [u, v] = this.getUVQ(data.base, sub, sup);
      //
      //  Lay out the pre-scripts, then the base, then the post-scripts
      //
      bbox.empty();
      if (data.numPrescripts) {
        bbox.combine(data.psup, scriptspace, u);
        bbox.combine(data.psub, scriptspace, v);
      }
      bbox.append(data.base);
      if (data.numScripts) {
        const w = bbox.w;
        bbox.combine(data.sup, w, u);
        bbox.combine(data.sub, w, v);
        bbox.w += scriptspace;
      }
      bbox.clean();
      this.setChildPWidths(recompute);
    }

    /**
     * @return {ScriptData}   The bounding box information about all the scripts
     */
     getScriptData() {
      //
      //  Return cached data, if any
      //
      if (this.scriptData) {
        return this.scriptData;
      }
      //
      //  Initialize the bounding box data
      //
      const data = this.scriptData = {
        base: null, sub: BBox.empty(), sup: BBox.empty(), psub: BBox.empty(), psup: BBox.empty(),
        numPrescripts: 0, numScripts: 0
      };
      //
      //  Get the bboxes for all the scripts and combine them into the scriptData
      //
      const lists = this.getScriptBBoxLists();
      this.combineBBoxLists(data.sub, data.sup, lists.subList, lists.supList);
      this.combineBBoxLists(data.psub, data.psup, lists.psubList, lists.psupList);
      this.scriptData.base = lists.base[0];
      //
      //  Save the lengths and return the data
      //
      this.scriptData.numPrescripts = lists.psubList.length;
      this.scriptData.numScripts = lists.subList.length;
      return this.scriptData;
    }

    /**
     * @return {ScriptLists}  The bounding boxes for all the scripts divided into lists by position
     */
     getScriptBBoxLists() {
      const lists = {
        base: [], subList: [], supList: [], psubList: [], psupList: []
      };
      //
      // The first entry is the base, and then they altername sub- and superscripts.
      // Once we find the <mprescripts/> element, switch to presub- and presuperscript lists.
      //
      let script = 'base';
      for (const child of this.childNodes) {
        if (child.node.isKind('mprescripts')) {
          script = 'psubList';
        } else {
          lists[script].push(child.getBBox());
          script = NextScript[script];
        }
      }
      //
      //  The index of the first prescript (skip over base, sub- and superscripts, and mprescripts)
      //
      this.firstPrescript = lists.subList.length + lists.supList.length + 2;
      //
      //  Make sure the lists are the same length
      //
      this.padLists(lists.subList, lists.supList);
      this.padLists(lists.psubList, lists.psupList);
      return lists;
    }

    /**
     * Pad the second list, if it is one short
     *
     * @param {BBox[]} list1   The first list
     * @param {BBox[]} list2   The second list
     */
     padLists(list1, list2) {
      if (list1.length > list2.length) {
        list2.push(BBox.empty());
      }
    }

    /**
     * @param {BBox} bbox1    The bbox for the combined subscripts
     * @param {BBox} bbox2    The bbox for the combined superscripts
     * @param {BBox[]} list1  The list of subscripts to combine
     * @param {BBox[]} list2  The list of superscripts to combine
     */
     combineBBoxLists(bbox1, bbox2, list1, list2) {
      for (let i = 0; i < list1.length; i++) {
        const [w1, h1, d1] = this.getScaledWHD(list1[i]);
        const [w2, h2, d2] = this.getScaledWHD(list2[i]);
        const w = Math.max(w1, w2);
        bbox1.w += w;
        bbox2.w += w;
        if (h1 > bbox1.h) bbox1.h = h1;
        if (d1 > bbox1.d) bbox1.d = d1;
        if (h2 > bbox2.h) bbox2.h = h2;
        if (d2 > bbox2.d) bbox2.d = d2;
      }
    }

    /**
     * @param {BBox} bbox  The bounding box from which to get the (scaled) width, height, and depth
     */
     getScaledWHD(bbox) {
      const {w, h, d, rscale} = bbox;
      return [w * rscale, h * rscale, d * rscale];
    }

    /*************************************************************/

    /**
     * @override
     */
     getUVQ(basebox, subbox, supbox) {
      if (!this.UVQ) {
        let [u, v, q] = [0, 0, 0];
        if (subbox.h === 0 && subbox.d === 0) {
          //
          //  Use placement for superscript only
          //
          u = this.getU(basebox, supbox);
        } else if (supbox.h === 0 && supbox.d === 0) {
          //
          //  Use placement for subsccript only
          //
          u = -this.getV(basebox, subbox);
        } else {
          //
          //  Use placement for both
          //
          [u, v, q] = super.getUVQ(basebox, subbox, supbox);
        }
        this.UVQ = [u, v, q];
      }
      return this.UVQ;
    }

  }, _class$8);

}

/*****************************************************************/
/**
 * The CHTMLmmultiscripts wrapper for the MmlMmultiscripts object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmmultiscripts extends
CommonMmultiscriptsMixin(CHTMLmsubsup) {

  /**
   * The mmultiscripts wrapper
   */
   static __initStatic() {this.kind = MmlMmultiscripts.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-prescripts': {
      display: 'inline-table',
      'padding-left': '.05em'   // scriptspace
    },
    'mjx-scripts': {
      display: 'inline-table',
      'padding-right': '.05em'   // scriptspace
    },
    'mjx-prescripts > mjx-row > mjx-cell': {
      'text-align': 'right'
    }
  };}

  /*************************************************************/

  /**
   * @override
   */
   toCHTML(parent) {
    const chtml = this.standardCHTMLnode(parent);
    const data = this.getScriptData();
    //
    //  Combine the bounding boxes of the pre- and post-scripts,
    //  and get the resulting baseline offsets
    //
    const sub = this.combinePrePost(data.sub, data.psub);
    const sup = this.combinePrePost(data.sup, data.psup);
    const [u, v] = this.getUVQ(data.base, sub, sup);
    //
    //  Place the pre-scripts, then the base, then the post-scripts
    //
    if (data.numPrescripts) {
      this.addScripts(u, -v, true, data.psub, data.psup, this.firstPrescript, data.numPrescripts);
    }
    this.childNodes[0].toCHTML(chtml);
    if (data.numScripts) {
      this.addScripts(u, -v, false, data.sub, data.sup, 1, data.numScripts);
    }
  }

  /**
   * Create a table with the super and subscripts properly separated and aligned.
   *
   * @param {number} u       The baseline offset for the superscripts
   * @param {number} v       The baseline offset for the subscripts
   * @param {boolean} isPre  True for prescripts, false for scripts
   * @param {BBox} sub       The subscript bounding box
   * @param {BBox} sup       The superscript bounding box
   * @param {number} i       The starting index for the scripts
   * @param {number} n       The number of sub/super-scripts
   */
   addScripts(u, v, isPre, sub, sup, i, n) {
    const adaptor = this.adaptor;
    const q = (u - sup.d) + (v - sub.h);             // separation of scripts
    const U = (u < 0 && v === 0 ? sub.h + u : u);    // vertical offset of table
    const rowdef = (q > 0 ? {style: {height: this.em(q)}} : {});
    const tabledef = (U ? {style: {'vertical-align': this.em(U)}} : {});
    const supRow = this.html('mjx-row');
    const sepRow = this.html('mjx-row', rowdef);
    const subRow = this.html('mjx-row');
    const name = 'mjx-' + (isPre ? 'pre' : '') + 'scripts';
    adaptor.append(this.chtml, this.html(name, tabledef, [supRow, sepRow, subRow]));
    let m = i + 2 * n;
    while (i < m) {
      this.childNodes[i++].toCHTML(adaptor.append(subRow, this.html('mjx-cell')) );
      this.childNodes[i++].toCHTML(adaptor.append(supRow, this.html('mjx-cell')) );
    }
  }

} CHTMLmmultiscripts.__initStatic(); CHTMLmmultiscripts.__initStatic2();

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements some numeric utility functions
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

/**
 * @param {number[]} A  The array to sum
 * @return {number}     The summ of the elements in A
 */
function sum(A) {
  return A.reduce((a, b) => a + b, 0);
}

/**
 * @param {number[]} A  The array whose maximum entry is sought
 * @return {number}     The largest entry in the array
 */
function max(A) {
  return A.reduce((a, b) => Math.max(a, b), 0);
}

var _class$9;

/*****************************************************************/
/**
 * The heights, depths, and widths of the rows and columns
 * Plus the natural height and depth (i.e., without the labels)
 * Plus the label column width
 */



































































































































































































































































































/*****************************************************************/
/**
 * The CommonMtable wrapper mixin for the MmlMtable object
 *
 * @template C  The table cell class
 * @temlpate R  the table row class
 * @template T  The Wrapper class constructor type
 */
function CommonMtableMixin



(Base) {

  return (_class$9 = class extends Base {

    /**
     * The number of columns in the table
     */
     __init() {this.numCols = 0;}
    /**
     * The number of rows in the table
     */
     __init2() {this.numRows = 0;}

    /**
     * True if there are labeled rows
     */
    

    /**
     * True if this mtable is the top element, or in a top-most mrow
     */
    

    /**
     * The parent node of this table (skipping non-parents and mrows)
     */
    
    /**
     * The position of the table as a child node of its container
     */
    

    /**
     * True if there is a frame
     */
    
    /**
     * The size of the frame line (or 0 if none)
     */
    
    /**
     * frame spacing on the left and right
     */
    
    /**
     * The spacing between columns
     */
    
    /**
     * The spacing between rows
     */
    
    /**
     * The width of columns lines (or 0 if no line for the column)
     */
    
    /**
     * The width of row lines (or 0 if no lone for that row)
     */
    
    /**
     * The column widths (or percentages, etc.)
     */
    

    /**
     * The bounding box information for the table rows and columns
     */
     __init3() {this.data = null;}

    /**
     * The table cells that have percentage-width content
     */
     __init4() {this.pwidthCells = [];}

    /**
     * The full width of a percentage-width table
     */
     __init5() {this.pWidth = 0;}

    /**
     * @return {R[]}  The rows of the table
     */
    get tableRows() {
      return this.childNodes;
    }

    /******************************************************************/

    /**
     * @override
     * @constructor
     */
    constructor(...args) {
      super(...args);_class$9.prototype.__init.call(this);_class$9.prototype.__init2.call(this);_class$9.prototype.__init3.call(this);_class$9.prototype.__init4.call(this);_class$9.prototype.__init5.call(this);      //
      // Determine the number of columns and rows, and whether the table is stretchy
      //
      this.numCols = max(this.tableRows.map(row => row.numCells));
      this.numRows = this.childNodes.length;
      this.hasLabels = this.childNodes.reduce((value, row) => value || row.node.isKind('mlabeledtr'), false);
      this.findContainer();
      this.isTop = !this.container || (this.container.node.isKind('math') && !this.container.parent);
      if (this.isTop) {
        this.jax.table = this;
      }
      this.getPercentageWidth();
      //
      // Get the frame, row, and column parameters
      //
      const attributes = this.node.attributes;
      this.frame = attributes.get('frame') !== 'none';
      this.fLine = (this.frame ? .07 : 0);
      this.fSpace = (this.frame ? this.convertLengths(this.getAttributeArray('framespacing')) : [0, 0]);
      this.cSpace = this.convertLengths(this.getColumnAttributes('columnspacing'));
      this.rSpace = this.convertLengths(this.getRowAttributes('rowspacing'));
      this.cLines = this.getColumnAttributes('columnlines').map(x => (x === 'none' ? 0 : .07));
      this.rLines = this.getRowAttributes('rowlines').map(x => (x === 'none' ? 0 : .07));
      this.cWidths = this.getColumnWidths();
      //
      // Stretch the rows and columns
      //
      this.stretchRows();
      this.stretchColumns();
    }

    /**
     * Find the container and the child position of the table
     */
     findContainer() {
      let node = this ;
      let parent = node.parent ;
      while (parent && (parent.node.notParent || parent.node.isKind('mrow'))) {
        node = parent;
        parent = parent.parent;
      }
      this.container = parent;
      this.containerI = node.node.childPosition();
    }

    /**
     * If the table has a precentage width or has labels, set the pwidth of the bounding box
     */
     getPercentageWidth() {
      if (this.hasLabels) {
        this.bbox.pwidth = BBox.fullWidth;
      } else {
        const width = this.node.attributes.get('width') ;
        if (isPercent(width)) {
          this.bbox.pwidth = width;
        }
      }
    }

    /**
     * Stretch the rows to the equal height or natural height
     */
     stretchRows() {
      const equal = this.node.attributes.get('equalrows') ;
      const HD = (equal ? this.getEqualRowHeight() : 0);
      const {H, D} = (equal ? this.getTableData() : {H: [0], D: [0]});
      const rows = this.tableRows;
      for (let i = 0; i < this.numRows; i++) {
        const hd = (equal ? [(HD + H[i] - D[i]) / 2, (HD - H[i] + D[i]) / 2] : null);
        rows[i].stretchChildren(hd);
      }
    }

    /**
     * Stretch the columns to their proper widths
     */
     stretchColumns() {
      for (let i = 0; i < this.numCols; i++) {
        const width = (typeof this.cWidths[i] === 'number' ? this.cWidths[i]  : null);
        this.stretchColumn(i, width);
      }
    }

    /**
     * Handle horizontal stretching within the ith column
     *
     * @param {number} i   The column number
     * @param {number} W   The computed width of the column (or null of not computed)
     */
     stretchColumn(i, W) {
      let stretchy = [];
      //
      //  Locate and count the stretchy children
      //
      for (const row of this.tableRows) {
        const cell = row.getChild(i);
        if (cell) {
          const child = cell.childNodes[0];
          if (child.stretch.dir === DIRECTION.None &&
              child.canStretch(DIRECTION.Horizontal)) {
            stretchy.push(child);
          }
        }
      }
      let count = stretchy.length;
      let nodeCount = this.childNodes.length;
      if (count && nodeCount > 1) {
        if (W === null) {
          W = 0;
          //
          //  If all the children are stretchy, find the largest one,
          //  otherwise, find the width of the non-stretchy children.
          //
          let all = (count > 1 && count === nodeCount);
          for (const row of this.tableRows) {
            const cell = row.getChild(i);
            if (cell) {
              const child = cell.childNodes[0];
              const noStretch = (child.stretch.dir === DIRECTION.None);
              if (all || noStretch) {
                const {w} = child.getBBox(noStretch);
                if (w > W) {
                  W = w;
                }
              }
            }
          }
        }
        //
        //  Stretch the stretchable children
        //
        for (const child of stretchy) {
          (child.coreMO() ).getStretchedVariant([W]);
        }
      }
    }

    /******************************************************************/

    /**
     * Determine the row heights and depths, the column widths,
     * and the natural width and height of the table.
     *
     * @return {TableData}  The dimensions of the rows and columns
     */
     getTableData() {
      if (this.data) {
        return this.data;
      }
      const H = new Array(this.numRows).fill(0);
      const D = new Array(this.numRows).fill(0);
      const W = new Array(this.numCols).fill(0);
      const NH = new Array(this.numRows);
      const ND = new Array(this.numRows);
      const LW = [0];
      const rows = this.tableRows;
      for (let j = 0; j < rows.length; j++) {
        const row = rows[j];
        for (let i = 0; i < row.numCells; i++) {
          const cell = row.getChild(i);
          this.updateHDW(cell, i, j, H, D, W);
          this.recordPWidthCell(cell, i);
        }
        NH[j] = H[j];
        ND[j] = D[j];
        if (row.labeled) {
          this.updateHDW(row.childNodes[0], 0, j, H, D, LW);
        }
      }
      const L = LW[0];
      this.data = {H, D, W, NH, ND, L};
      return this.data;
    }

    /**
     * @param {C} cell         The cell whose height, depth, and width are to be added into the H, D, W arrays
     * @param {number} i       The column number for the cell
     * @param {number} j       The row number for the cell
     * @param {number[]} H     The maximum height for each of the rows
     * @param {number[]} D     The maximum depth for each of the rows
     * @param {number[]=} W    The maximum width for each column
     */
     updateHDW(cell, i, j, H, D, W = null) {
      let {h, d, w} = cell.getBBox();
      if (h < .75) h = .75;
      if (d < .25) d = .25;
      if (h > H[j]) H[j] = h;
      if (d > D[j]) D[j] = d;
      if (W && w > W[i]) W[i] = w;
    }

    /**
     * @param {C} cell     The cell to check for percentage widths
     * @param {number} i   The column index of the cell
     */
     recordPWidthCell(cell, i) {
      if (cell.childNodes[0] && cell.childNodes[0].getBBox().pwidth) {
        this.pwidthCells.push([cell, i]);
      }
    }

    /**
     * @override
     */
     computeBBox(bbox, _recompute = false) {
      const {H, D} = this.getTableData();
      let height, width;
      //
      // For equal rows, use the common height and depth for all rows
      // Otherwise, use the height and depths for each row separately.
      // Add in the spacing, line widths, and frame size.
      //
      if (this.node.attributes.get('equalrows') ) {
        const HD = this.getEqualRowHeight();
        height = sum([].concat(this.rLines, this.rSpace)) + HD * this.numRows;
      } else {
        height = sum(H.concat(D, this.rLines, this.rSpace));
      }
      height += 2 * (this.fLine + this.fSpace[1]);
      //
      //  Get the widths of all columns
      //
      const CW = this.getComputedWidths();
      //
      //  Get the expected width of the table
      //
      width = sum(CW.concat(this.cLines, this.cSpace)) + 2 * (this.fLine + this.fSpace[0]);
      //
      //  If the table width is not 'auto', determine the specified width
      //    and pick the larger of the specified and computed widths.
      //
      const w = this.node.attributes.get('width') ;
      if (w !== 'auto') {
        width = Math.max(this.length2em(w, 0) + 2 * this.fLine, width);
      }
      //
      //  Return the bounding box information
      //
      let [h, d] = this.getBBoxHD(height);
      bbox.h = h;
      bbox.d = d;
      bbox.w = width;
      let [L, R] = this.getBBoxLR();
      bbox.L = L;
      bbox.R = R;
      //
      //  Handle cell widths if width is not a percentage
      //
      if (!isPercent(w)) {
        this.setColumnPWidths();
      }
    }

    /**
     * @override
     */
     setChildPWidths(_recompute, cwidth, _clear) {
      const width = this.node.attributes.get('width') ;
      if (!isPercent(width)) return false;
      if (!this.hasLabels) {
        this.bbox.pwidth = '';
        this.container.bbox.pwidth = '';
      }
      const {w, L, R} = this.bbox;
      const W = Math.max(w, this.length2em(width, Math.max(cwidth, L + w + R)));
      const cols = (this.node.attributes.get('equalcolumns')  ?
                    Array(this.numCols).fill(this.percent(1 / Math.max(1, this.numCols))) :
                    this.getColumnAttributes('columnwidth', 0));
      this.cWidths = this.getColumnWidthsFixed(cols, W);
      const CW = this.getComputedWidths();
      this.pWidth = sum(CW.concat(this.cLines, this.cSpace)) + 2 * (this.fLine + this.fSpace[0]);
      if (this.isTop) {
        this.bbox.w = this.pWidth;
      }
      this.setColumnPWidths();
      if (this.pWidth !== w) {
        this.parent.invalidateBBox();
      }
      return this.pWidth !== w;
    }

    /**
     * Finalize any cells that have percentage-width content
     */
     setColumnPWidths() {
      const W = this.cWidths ;
      for (const [cell, i] of this.pwidthCells) {
        if (cell.setChildPWidths(false, W[i])) {
          cell.invalidateBBox();
          cell.getBBox();
        }
      }
    }

    /**
     * @param {number} height   The total height of the table
     * @return {[number, number]}  The [height, depth] for the aligned table
     */
     getBBoxHD(height) {
      const [align, row] = this.getAlignmentRow();
      if (row === null) {
        const a = this.font.params.axis_height;
        const h2 = height / 2;
        const HD = {
          top: [0, height],
          center: [h2, h2],
          bottom: [height, 0],
          baseline: [h2, h2],
          axis: [h2 + a, h2 - a]
        };
        return HD[align] || [h2, h2];
      } else {
        const y = this.getVerticalPosition(row, align);
        return [y, height - y];
      }
    }

    /**
     * Get bbox left and right amounts to cover labels
     */
     getBBoxLR() {
      if (this.hasLabels) {
        const side = this.node.attributes.get('side') ;
        const [pad, align] = this.getPadAlignShift(side);
        return (align === 'center' ? [pad, pad] :
                side === 'left' ? [pad, 0] : [0, pad]);
      }
      return [0, 0];
    }

    /**
     * @param {string} side                 The side for the labels
     * @return {[number, string, number]}   The padding, alignment, and shift amounts
     */
     getPadAlignShift(side) {
      //
      //  Make sure labels don't overlap table
      //
      const {L} = this.getTableData();
      const sep = this.length2em(this.node.attributes.get('minlabelspacing'));
      let pad = L + sep;
      const [lpad, rpad] = (this.styles == null ? ['', ''] :
                            [this.styles.get('padding-left'), this.styles.get('padding-right')]);
      if (lpad || rpad) {
        pad = Math.max(pad, this.length2em(lpad || '0'), this.length2em(rpad || '0'));
      }
      //
      //  Handle indentation
      //
      let [align, shift] = this.getAlignShift();
      if (align === side) {
        shift = (side === 'left' ? Math.max(pad, shift) - pad : Math.min(-pad, shift) + pad);
      }
      return [pad, align, shift] ;
    }

    /**
     * @override
     */
     getAlignShift() {
      return (this.isTop ? super.getAlignShift() :
              [this.container.getChildAlign(this.containerI), 0] );
    }

    /**
     * @return {number}    The true width of the table (without labels)
     */
     getWidth() {
      return this.pWidth || this.getBBox().w;
    }

    /******************************************************************/

    /**
     * @return {number}   The maximum height of a row
     */
     getEqualRowHeight() {
      const {H, D} = this.getTableData();
      const HD = Array.from(H.keys()).map(i => H[i] + D[i]);
      return Math.max.apply(Math, HD);
    }

    /**
     * @return {number[]}   The array of computed widths
     */
     getComputedWidths() {
      const W = this.getTableData().W;
      let CW = Array.from(W.keys()).map(i => {
        return (typeof this.cWidths[i] === 'number' ? this.cWidths[i]  : W[i]);
      });
      if (this.node.attributes.get('equalcolumns') ) {
        CW = Array(CW.length).fill(max(CW));
      }
      return CW;
    }

    /**
     * Determine the column widths that can be computed (and need to be set).
     * The resulting arrays will have numbers for fixed-size arrays,
     *   strings for percentage sizes that can't be determined now,
     *   and null for stretchy columns that will expand to fill the extra space.
     * Depending on the width specified for the table, different column
     *  values can be determined.
     *
     * @return {(string|number|null)[]}  The array of widths
     */
     getColumnWidths() {
      const width = this.node.attributes.get('width') ;
      if (this.node.attributes.get('equalcolumns') ) {
        return this.getEqualColumns(width);
      }
      const swidths = this.getColumnAttributes('columnwidth', 0);
      if (width === 'auto') {
        return this.getColumnWidthsAuto(swidths);
      }
      if (isPercent(width)) {
        return this.getColumnWidthsPercent(swidths);
      }
      return this.getColumnWidthsFixed(swidths, this.length2em(width));
    }

    /**
     * For tables with equal columns, get the proper amount per column.
     *
     * @param {string} width   The width attribute of the table
     * @return {(string|number|null)[]}  The array of widths
     */
     getEqualColumns(width) {
      const n = Math.max(1, this.numCols);
      let cwidth;
      if (width === 'auto') {
        const {W} = this.getTableData();
        cwidth = max(W);
      } else if (isPercent(width)) {
        cwidth = this.percent(1 / n);
      } else {
        const w = sum([].concat(this.cLines, this.cSpace)) + 2 * this.fSpace[0];
        cwidth = Math.max(0, this.length2em(width) - w) / n;
      }
      return Array(this.numCols).fill(cwidth);
    }

    /**
     * For tables with width="auto", auto and fit columns
     * will end up being natural width, so don't need to
     * set those explicitly.
     *
     * @param {string[]} swidths   The split and padded columnwidths attribute
     * @return {ColumnWidths}  The array of widths
     */
     getColumnWidthsAuto(swidths) {
      return swidths.map(x => {
        if (x === 'auto' || x === 'fit') return null;
        if (isPercent(x)) return x;
        return this.length2em(x);
      });
    }

    /**
     * For tables with percentage widths, let 'fit' columns (or 'auto'
     * columns if there are not 'fit' ones) will stretch automatically,
     * but for 'auto' columns (when there are 'fit' ones), set the size
     * to the natural size of the column.
     *
     * @param {string[]} swidths   The split and padded columnwidths attribute
     * @return {ColumnWidths}      The array of widths
     */
     getColumnWidthsPercent(swidths) {
      const hasFit = swidths.indexOf('fit') >= 0;
      const {W} = (hasFit ? this.getTableData() : {W: null});
      return Array.from(swidths.keys()).map(i => {
        const x = swidths[i];
        if (x === 'fit') return null;
        if (x === 'auto') return (hasFit ? W[i] : null);
        if (isPercent(x)) return x;
        return this.length2em(x);
      });
    }

    /**
     * For fixed-width tables, compute the column widths of all columns.
     *
     * @param {string[]} swidths   The split and padded columnwidths attribute
     * @param {number} width       The width of the table
     * @return {ColumnWidths}      The array of widths
     */
     getColumnWidthsFixed(swidths, width) {
      //
      // Get the indices of the fit and auto columns, and the number of fit or auto entries.
      // If there are fit or auto columns, get the column widths.
      //
      const indices = Array.from(swidths.keys());
      const fit = indices.filter(i => swidths[i] === 'fit');
      const auto = indices.filter(i => swidths[i] === 'auto');
      const n = fit.length || auto.length;
      const {W} = (n ? this.getTableData() : {W: null});
      //
      // Determine the space remaining from the fixed width after the
      //   separation and lines have been removed (cwidth), and
      //   after the width of the columns have been removed (dw).
      //
      const cwidth = width - sum([].concat(this.cLines, this.cSpace)) - 2 * this.fSpace[0];
      let dw = cwidth;
      indices.forEach(i => {
        const x = swidths[i];
        dw -= (x === 'fit' || x === 'auto' ? W[i] : this.length2em(x, width));
      });
      //
      // Get the amount of extra space per column, or 0 (fw)
      //
      const fw = (n && dw > 0 ? dw / n : 0);
      //
      // Return the column widths (plus extra space for those that are stretching
      //
      return indices.map(i => {
        const x = swidths[i];
        if (x === 'fit') return W[i] + fw;
        if (x === 'auto') return W[i] + (fit.length === 0 ? fw : 0);
        return this.length2em(x, cwidth);
      });
    }

    /**
     * @param {number} i      The row number (starting at 0)
     * @param {string} align  The alignment on that row
     * @return {number}       The offest of the alignment position from the top of the table
     */
     getVerticalPosition(i, align) {
      const equal = this.node.attributes.get('equalrows') ;
      const {H, D} = this.getTableData();
      const HD = (equal ? this.getEqualRowHeight() : 0);
      const space = this.getRowHalfSpacing();
      //
      //  Start with frame size and add in spacing, height and depth,
      //    and line thickness for each row.
      //
      let y = this.fLine;
      for (let j = 0; j < i; j++) {
        y += space[j] + (equal ? HD : H[j] + D[j]) + space[j + 1] + this.rLines[j];
      }
      //
      //  For equal rows, get updated height and depth
      //
      const [h, d] = (equal ? [(HD + H[i] - D[i]) / 2, (HD - H[i] + D[i]) / 2] : [H[i], D[i]]);
      //
      //  Add the offset into the specified row
      //
      const offset = {
        top: 0,
        center: space[i] + (h + d) / 2,
        bottom: space[i] + h + d + space[i + 1],
        baseline: space[i] + h,
        axis: space[i] + h - .25
      };
      y += offset[align] || 0;
      //
      //  Return the final result
      //
      return y;
    }

    /******************************************************************/

    /**
     * @param {number} fspace   The frame spacing to use
     * @param {number[]} space  The array of spacing values to convert to strings
     * @return {string[]}       The half-spacing as stings with units of "em"
     *                           with frame spacing at the beginning and end
     */
     getEmHalfSpacing(fspace, space) {
      //
      //  Get the column spacing values, and add the frame spacing values at the left and right
      //
      const fspaceEm = this.em(fspace);
      const spaceEm = this.addEm(space, 2);
      spaceEm.unshift(fspaceEm);
      spaceEm.push(fspaceEm);
      return spaceEm;
    }

    /**
     * @return {number[]}   The half-spacing for rows with frame spacing at the ends
     */
     getRowHalfSpacing() {
      const space = this.rSpace.map(x => x / 2);
      space.unshift(this.fSpace[1]);
      space.push(this.fSpace[1]);
      return space;
    }

    /**
     * @return {number[]}   The half-spacing for columns with frame spacing at the ends
     */
     getColumnHalfSpacing() {
      const space = this.cSpace.map(x => x / 2);
      space.unshift(this.fSpace[0]);
      space.push(this.fSpace[0]);
      return space;
    }

    /**
     * @return {[string,number|null]}  The alignment and row number (based at 0) or null
     */
     getAlignmentRow() {
      const [align, row] = split(this.node.attributes.get('align') );
      if (row == null) return [align, null];
      let i = parseInt(row);
      if (i < 0) i += this.numRows + 1;
      return [align, i < 1 || i > this.numRows ? null : i - 1];
    }

    /**
     * @param {string} name           The name of the attribute to get as an array
     * @param {number=} i             Return this many fewer than numCols entries
     * @return {string[]}             The array of values in the given attribute, split at spaces,
     *                                 padded to the number of table columns (minus 1) by repeating the last entry
     */
     getColumnAttributes(name, i = 1) {
      const n = this.numCols - i;
      const columns = this.getAttributeArray(name);
      if (columns.length === 0) return null;
      while (columns.length < n) {
        columns.push(columns[columns.length - 1]);
      }
      if (columns.length > n) {
        columns.splice(n);
      }
      return columns;
    }

    /**
     * @param {string} name           The name of the attribute to get as an array
     * @param {number=} i             Return this many fewer than numRows entries
     * @return {string[]}             The array of values in the given attribute, split at spaces,
     *                                 padded to the number of table rows (minus 1) by repeating the last entry
     */
     getRowAttributes(name, i = 1) {
      const n = this.numRows - i;
      const rows = this.getAttributeArray(name);
      if (rows.length === 0) return null;
      while (rows.length < n) {
        rows.push(rows[rows.length - 1]);
      }
      if (rows.length > n) {
        rows.splice(n);
      }
      return rows;
    }

    /**
     * @param {string} name           The name of the attribute to get as an array
     * @return {string[]}             The array of values in the given attribute, split at spaces
     *                                 (after leading and trailing spaces are removed, and multiple
     *                                  spaces have been collapsed to one).
     */
     getAttributeArray(name) {
      const value = this.node.attributes.get(name) ;
      if (!value) return [this.node.attributes.getDefault(name) ];
      return split(value);
    }

    /**
     * Adds "em" to a list of dimensions, after dividing by n (defaults to 1).
     *
     * @param {string[]} list   The array of dimensions (in em's)
     * @param {nunber=} n       The number to divide each dimension by after converted
     * @return {string[]}       The array of values with "em" added
     */
     addEm(list, n = 1) {
      if (!list) return null;
      return list.map(x => this.em(x / n));
    }

    /**
     * Converts an array of dimensions (with arbitrary units) to an array of numbers
     *   representing the dimensions in units of em's.
     *
     * @param {string[]} list   The array of dimensions to be turned into em's
     * @return {number[]}       The array of values converted to em's
     */
     convertLengths(list) {
      if (!list) return null;
      return list.map(x => this.length2em(x));
    }
  }, _class$9);

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 * The CHTMLmtable wrapper for the MmlMtable object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLmtable extends
CommonMtableMixin(CHTMLWrapper) {

  /**
   * The mtable wrapper
   */
   static __initStatic() {this.kind = MmlMtable.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-mtable': {
      'vertical-align': '.25em',
      'text-align': 'center',
      'position': 'relative',
      'box-sizing': 'border-box'
    },
    'mjx-labels': {
      position: 'absolute',
      left: 0,
      top: 0
    },
    'mjx-table': {
      'display': 'inline-block',
      'vertical-align': '-.5ex'
    },
    'mjx-table > mjx-itable': {
      'vertical-align': 'middle',
      'text-align': 'left',
      'box-sizing': 'border-box'
    },
    'mjx-labels > mjx-itable': {
      position: 'absolute',
      top: 0
    },
    'mjx-mtable[justify="left"]': {
      'text-align': 'left'
    },
    'mjx-mtable[justify="right"]': {
      'text-align': 'right'
    },
    'mjx-mtable[justify="left"][side="left"]': {
      'padding-right': '0 ! important'
    },
    'mjx-mtable[justify="left"][side="right"]': {
      'padding-left': '0 ! important'
    },
    'mjx-mtable[justify="right"][side="left"]': {
      'padding-right': '0 ! important'
    },
    'mjx-mtable[justify="right"][side="right"]': {
      'padding-left': '0 ! important'
    },
    'mjx-mtable[align]': {
      'vertical-align': 'baseline'
    },
    'mjx-mtable[align="top"] > mjx-table': {
      'vertical-align': 'top'
    },
    'mjx-mtable[align="bottom"] > mjx-table': {
      'vertical-align': 'bottom'
    },
    'mjx-mtable[side="right"] mjx-labels': {
      'min-width': '100%'
    }
  };}

  /**
   * The column for labels
   */
  

  /**
   * The inner table DOM node
   */
  

  /******************************************************************/

  /**
   * @override
   */
  constructor(factory, node, parent = null) {
    super(factory, node, parent);
    this.itable = this.html('mjx-itable');
    this.labels = this.html('mjx-itable');
  }

  /**
   * @override
   */
   getAlignShift() {
    const data = super.getAlignShift();
    if (!this.isTop) {
      data[1] = 0;
    }
    return data;
  }

  /**
   * @override
   */
   toCHTML(parent) {
    //
    //  Create the rows inside an mjx-itable (which will be used to center the table on the math axis)
    //
    const chtml = this.standardCHTMLnode(parent);
    this.adaptor.append(chtml, this.html('mjx-table', {}, [this.itable]));
    for (const child of this.childNodes) {
      child.toCHTML(this.itable);
    }
    //
    //  Pad the rows of the table, if needed
    //  Then set the column and row attributes for alignment, spacing, and lines
    //  Finally, add the frame, if needed
    //
    this.padRows();
    this.handleColumnSpacing();
    this.handleColumnLines();
    this.handleColumnWidths();
    this.handleRowSpacing();
    this.handleRowLines();
    this.handleEqualRows();
    this.handleFrame();
    this.handleWidth();
    this.handleLabels();
    this.handleAlign();
    this.handleJustify();
    this.shiftColor();
  }

  /**
   * Move background color (if any) to inner itable node so that labeled tables are
   * only colored on the main part of the table.
   */
   shiftColor() {
    const adaptor = this.adaptor;
    const color = adaptor.getStyle(this.chtml, 'backgroundColor');
    if (color) {
      adaptor.setStyle(this.chtml, 'backgroundColor', '');
      adaptor.setStyle(this.itable, 'backgroundColor', color);
    }
  }

  /******************************************************************/

  /**
   * Pad any short rows with extra cells
   */
   padRows() {
    const adaptor = this.adaptor;
    for (const row of adaptor.childNodes(this.itable) ) {
      while (adaptor.childNodes(row).length < this.numCols) {
        adaptor.append(row, this.html('mjx-mtd'));
      }
    }
  }

  /**
   * Set the inter-column spacing for all columns
   *  (Use frame spacing on the outsides, if needed, and use half the column spacing on each
   *   neighboring column, so that if column lines are needed, they fall in the middle
   *   of the column space.)
   */
   handleColumnSpacing() {
    const spacing = this.getEmHalfSpacing(this.fSpace[0], this.cSpace);
    const frame = this.frame;
    //
    //  For each row...
    //
    for (const row of this.tableRows) {
      let i = 0;
      //
      //  For each cell in the row...
      //
      for (const cell of row.tableCells) {
        //
        //  Get the left and right-hand spacing
        //
        const lspace = spacing[i++];
        const rspace = spacing[i];
        //
        //  Set the style for the spacing, if it is needed, and isn't the
        //  default already set in the mtd styles
        //
        const styleNode = (cell ? cell.chtml : this.adaptor.childNodes(row.chtml)[i] );
        if ((i > 1 && lspace !== '0.4em') || (frame && i === 1)) {
          this.adaptor.setStyle(styleNode, 'paddingLeft', lspace);
        }
        if ((i < this.numCols && rspace !== '0.4em') || (frame && i === this.numCols)) {
          this.adaptor.setStyle(styleNode, 'paddingRight', rspace);
        }
      }
    }
  }

  /**
   * Add borders to the left of cells to make the column lines
   */
   handleColumnLines() {
    if (this.node.attributes.get('columnlines') === 'none') return;
    const lines = this.getColumnAttributes('columnlines');
    for (const row of this.childNodes) {
      let i = 0;
      for (const cell of this.adaptor.childNodes(row.chtml).slice(1) ) {
        const line = lines[i++];
        if (line === 'none') continue;
        this.adaptor.setStyle(cell, 'borderLeft', '.07em ' + line);
      }
    }
  }

  /**
   * Add widths to the cells for the column widths
   */
   handleColumnWidths() {
    for (const row of this.childNodes) {
      let i = 0;
      for (const cell of this.adaptor.childNodes(row.chtml) ) {
        const w = this.cWidths[i++];
        if (w !== null) {
          const width = (typeof w === 'number' ? this.em(w) : w);
          this.adaptor.setStyle(cell, 'width', width);
          this.adaptor.setStyle(cell, 'maxWidth', width);
          this.adaptor.setStyle(cell, 'minWidth', width);
        }
      }
    }
  }

  /**
   * Set the inter-row spacing for all rows
   *  (Use frame spacing on the outsides, if needed, and use half the row spacing on each
   *   neighboring row, so that if row lines are needed, they fall in the middle
   *   of the row space.)
   */
   handleRowSpacing() {
    const spacing = this.getEmHalfSpacing(this.fSpace[1], this.rSpace);
    const frame = this.frame;
    //
    //  For each row...
    //
    let i = 0;
    for (const row of this.childNodes) {
      //
      //  Get the top and bottom spacing
      //
      const tspace = spacing[i++];
      const bspace = spacing[i];
      //
      //  For each cell in the row...
      //
      for (const cell of row.childNodes) {
        //
        //  Set the style for the spacing, if it is needed, and isn't the
        //  default already set in the mtd styles
        //
        if ((i > 1 && tspace !== '0.215em') || (frame && i === 1)) {
          this.adaptor.setStyle(cell.chtml, 'paddingTop', tspace);
        }
        if ((i < this.numRows && bspace !== '0.215em') || (frame && i === this.numRows)) {
          this.adaptor.setStyle(cell.chtml, 'paddingBottom', bspace);
        }
      }
    }
  }

  /**
   * Add borders to the tops of cells to make the row lines
   */
   handleRowLines() {
    if (this.node.attributes.get('rowlines') === 'none') return;
    const lines = this.getRowAttributes('rowlines');
    let i = 0;
    for (const row of this.childNodes.slice(1)) {
      const line = lines[i++];
      if (line === 'none') continue;
      for (const cell of this.adaptor.childNodes(row.chtml) ) {
        this.adaptor.setStyle(cell, 'borderTop', '.07em ' + line);
      }
    }
  }

  /**
   * Set the heights of all rows to be the same, and properly center
   * baseline or axis rows within the newly sized
   */
   handleEqualRows() {
    if (!this.node.attributes.get('equalrows')) return;
    const space = this.getRowHalfSpacing();
    const {H, D, NH, ND} = this.getTableData();
    const HD = this.getEqualRowHeight();
    //
    // Loop through the rows and set their heights
    //
    for (let i = 0; i < this.numRows; i++) {
      const row = this.childNodes[i];
      if (HD !== NH[i] + ND[i]) {
        this.setRowHeight(row, HD, (HD - H[i] + D[i]) / 2, space[i] + space[i + 1]);
      }
    }
  }

  /**
   * Set the height of the row, and make sure that the baseline is in the right position for cells
   *   that are row aligned to baseline ot axis
   *
   * @param {CHTMLWrapper} row   The row to be set
   * @param {number} HD          The total height+depth for the row
   * @param {number] D           The new depth for the row
   * @param {number} space       The total spacing above and below the row
   */
   setRowHeight(row, HD, D, space) {
    this.adaptor.setStyle(row.chtml, 'height', this.em(HD + space));
    const ralign = row.node.attributes.get('rowalign') ;
    //
    //  Loop through the cells and set the strut height and depth.
    //    The strut is the last element in the cell.
    //
    for (const cell of row.childNodes) {
      if (this.setCellBaseline(cell, ralign, HD, D)) break;
    }
  }

  /**
   * Make sure the baseline is in the correct place for cells aligned on baseline or axis
   *
   * @param {CHTMLWrapper} cell  The cell to modify
   * @param {string} ralign      The alignment of the row
   * @param {number} HD          The total height+depth for the row
   * @param {number] D           The new depth for the row
   * @return {boolean}           True if no other cells in this row need to be processed
   */
   setCellBaseline(cell, ralign, HD, D) {
    const calign = cell.node.attributes.get('rowalign');
    if (calign === 'baseline' || calign === 'axis') {
      const adaptor = this.adaptor;
      const child = adaptor.lastChild(cell.chtml) ;
      adaptor.setStyle(child, 'height', this.em(HD));
      adaptor.setStyle(child, 'verticalAlign', this.em(-D));
      const row = cell.parent;
      if ((!row.node.isKind('mlabeledtr') || cell !== row.childNodes[0]) &&
          (ralign === 'baseline' || ralign === 'axis')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Add a frame to the mtable, if needed
   */
   handleFrame() {
    if (this.frame) {
      this.adaptor.setStyle(this.itable, 'border', '.07em ' + this.node.attributes.get('frame'));
    }
  }

  /**
   * Handle percentage widths and fixed widths
   */
   handleWidth() {
    const adaptor = this.adaptor;
    const {w, L, R} = this.getBBox();
    adaptor.setStyle(this.chtml, 'minWidth', this.em(L + w + R));
    let W = this.node.attributes.get('width') ;
    if (isPercent(W)) {
      adaptor.setStyle(this.chtml, 'width', '');
      adaptor.setAttribute(this.chtml, 'width', 'full');
    } else if (!this.hasLabels) {
      if (W === 'auto') return;
      W = this.em(this.length2em(W) + 2 * this.fLine);
    }
    const table = adaptor.firstChild(this.chtml) ;
    adaptor.setStyle(table, 'width', W);
    adaptor.setStyle(table, 'minWidth', this.em(w));
    if (L || R) {
      adaptor.setStyle(this.chtml, 'margin', '');
      if (L === R) {
        adaptor.setStyle(table, 'margin', '0 ' + this.em(R));
      } else {
        adaptor.setStyle(table, 'margin', '0 ' + this.em(R) + ' 0 ' + this.em(L));
      }
    }
    adaptor.setAttribute(this.itable, 'width', 'full');
  }

  /**
   * Handle alignment of table to surrounding baseline
   */
   handleAlign() {
    const [align, row] = this.getAlignmentRow();
    if (row === null) {
      if (align !== 'axis') {
        this.adaptor.setAttribute(this.chtml, 'align', align);
      }
    } else {
      const y = this.getVerticalPosition(row, align);
      this.adaptor.setAttribute(this.chtml, 'align', 'top');
      this.adaptor.setStyle(this.chtml, 'verticalAlign', this.em(y));
    }
  }

  /**
   * Mark the alignment of the table
   */
   handleJustify() {
    const align = this.getAlignShift()[0];
    if (align !== 'center') {
      this.adaptor.setAttribute(this.chtml, 'justify', align);
    }
  }

  /******************************************************************/

  /**
   * Handle addition of labels to the table
   */
   handleLabels() {
    if (!this.hasLabels) return;
    const labels = this.labels;
    const attributes = this.node.attributes;
    const adaptor = this.adaptor;
    //
    //  Set the side for the labels
    //
    const side = attributes.get('side') ;
    adaptor.setAttribute(this.chtml, 'side', side);
    adaptor.setAttribute(labels, 'align', side);
    adaptor.setStyle(labels, side, '0');
    //
    //  Make sure labels don't overlap table
    //
    const [align, shift] = this.addLabelPadding(side);
    //
    //  Handle indentation
    //
    if (shift) {
      const table = adaptor.firstChild(this.chtml) ;
      this.setIndent(table, align, shift);
    }
    //
    // Add the labels to the table
    //
    this.updateRowHeights();
    this.addLabelSpacing();
  }

  /**
   * @param {string} side         The side for the labels
   * @return {[string, number]}   The alignment and shift values
   */
   addLabelPadding(side) {
    const [ , align, shift] = this.getPadAlignShift(side);
    const styles = {};
    if (side === 'right') {
      const W = this.node.attributes.get('width') ;
      const {w, L, R} = this.getBBox();
      styles.style = {
        width: (isPercent(W) ? 'calc(' + W + ' + ' + this.em(L + R) + ')' : this.em(L + w + R))
      };
    }
    this.adaptor.append(this.chtml, this.html('mjx-labels', styles, [this.labels]));
    return [align, shift] ;
  }

  /**
   * Update any rows that are not naturally tall enough for the labels,
   *   and set the baseline for labels that are baseline aligned.
   */
   updateRowHeights() {
    if (this.node.attributes.get('equalrows') ) return;
    let {H, D, NH, ND} = this.getTableData();
    const space = this.getRowHalfSpacing();
    for (let i = 0; i < this.numRows; i++) {
      const row = this.childNodes[i];
      if (H[i] !== NH[i] || D[i] !== ND[i]) {
        this.setRowHeight(row, H[i] + D[i], D[i], space[i] + space[i + 1]);
      } else if (row.node.isKind('mlabeledtr')) {
        this.setCellBaseline(row.childNodes[0], '', H[i] + D[i], D[i]);
      }
    }
  }

  /**
   * Add spacing elements between the label rows to align them with the rest of the table
   */
   addLabelSpacing() {
    const adaptor = this.adaptor;
    const equal = this.node.attributes.get('equalrows') ;
    const {H, D} = this.getTableData();
    const HD = (equal ? this.getEqualRowHeight() : 0);
    const space = this.getRowHalfSpacing();
    //
    //  Start with frame size and add in spacing, height and depth,
    //    and line thickness for each non-labeled row.
    //
    let h = this.fLine;
    let current = adaptor.firstChild(this.labels) ;
    for (let i = 0; i < this.numRows; i++) {
      const row = this.childNodes[i];
      if (row.node.isKind('mlabeledtr')) {
        h && adaptor.insert(this.html('mjx-mtr', {style: {height: this.em(h)}}), current);
        adaptor.setStyle(current, 'height', this.em((equal ? HD : H[i] + D[i]) + space[i] + space[i + 1]));
        current = adaptor.next(current) ;
        h = this.rLines[i];
      } else {
        h += space[i] + (equal ? HD : H[i] + D[i]) + space[i + 1] + this.rLines[i];
      }
    }
  }

} CHTMLmtable.__initStatic(); CHTMLmtable.__initStatic2();

/*****************************************************************/
/**
 * The CommonMtr interface
 *
 * @template C  The class for table cells
 */




















































/*****************************************************************/
/**
 * The CommonMtr wrapper for the MmlMtr object
 *
 * @template C  The class for table cells
 * @template T  The Wrapper class constructor type
 */
function CommonMtrMixin


(Base) {

  return class extends Base {

    /**
     * @override
     */
    get fixesPWidth() {
      return false;
    }

    /**
     * @return {number}   The number of mtd's in the mtr
     */
    get numCells() {
      return this.childNodes.length;
    }

    /**
     * @return {boolean}   True if this is a labeled row
     */
    get labeled() {
      return false;
    }

    /**
     * @return {C[]}  The child nodes that are part of the table (no label node)
     */
    get tableCells() {
      return this.childNodes;
    }

    /**
     * @param {number} i   The index of the child to get (skipping labels)
     * @return {C}         The ith child node wrapper
     */
     getChild(i) {
      return this.childNodes[i];
    }

    /**
     * @return {BBox[]}  An array of the bounding boxes for the mtd's in the row
     */
     getChildBBoxes() {
      return this.childNodes.map(cell => cell.getBBox());
    }

    /**
     * Handle vertical stretching of cells to match height of
     *  other cells in the row.
     *
     * @param {number[]} HD   The total height and depth for the row [H, D]
     *
     * If this isn't specified, the maximum height and depth is computed.
     */
     stretchChildren(HD = null) {
      let stretchy = [];
      let children = (this.labeled ? this.childNodes.slice(1) : this.childNodes);
      //
      //  Locate and count the stretchy children
      //
      for (const mtd of children) {
        const child = mtd.childNodes[0];
        if (child.canStretch(DIRECTION.Vertical)) {
          stretchy.push(child);
        }
      }
      let count = stretchy.length;
      let nodeCount = this.childNodes.length;
      if (count && nodeCount > 1) {
        if (HD === null) {
          let H = 0, D = 0;
          //
          //  If all the children are stretchy, find the largest one,
          //  otherwise, find the height and depth of the non-stretchy
          //  children.
          //
          let all = (count > 1 && count === nodeCount);
          for (const mtd of children) {
            const child = mtd.childNodes[0];
            const noStretch = (child.stretch.dir === DIRECTION.None);
            if (all || noStretch) {
              const {h, d} = child.getBBox(noStretch);
              if (h > H) {
                H = h;
              }
              if (d > D) {
                D = d;
              }
            }
          }
          HD = [H, D];
        }
        //
        //  Stretch the stretchable children
        //
        for (const child of stretchy) {
          (child.coreMO() ).getStretchedVariant(HD);
        }
      }
    }

  };

}

/*****************************************************************/
/**
 * The CommonMlabeledtr interface
 *
 * @template C  The class for table cells
 */










/*****************************************************************/
/**
 * The CommonMlabeledtr wrapper mixin for the MmlMlabeledtr object
 *
 * @template C  The class for table cells
 * @template T  The Wrapper class constructor type
 */
function CommonMlabeledtrMixin


(Base) {

  return class extends Base {

    /**
     * @override
     */
    get numCells() {
      //
      //  Don't include the label mtd
      //
      return Math.max(0, this.childNodes.length - 1);
    }

    /**
     * @override
     */
    get labeled() {
      return true;
    }

    /**
     * @override
     */
    get tableCells() {
      return this.childNodes.slice(1) ;
    }

    /**
     * @override
     */
     getChild(i) {
      return this.childNodes[i + 1] ;
    }

    /**
     * @override
     */
     getChildBBoxes() {
      //
      //  Don't include the label mtd
      //
      return this.childNodes.slice(1).map(cell => cell.getBBox());
    }

  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 * The CHTMLmtr wrapper for the MmlMtr object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmtr extends
CommonMtrMixin(CHTMLWrapper) {

  /**
   * The mtr wrapper
   */
   static __initStatic() {this.kind = MmlMtr.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-mtr': {
      display: 'table-row',
    },
    'mjx-mtr[rowalign="top"] > mjx-mtd': {
      'vertical-align': 'top'
    },
    'mjx-mtr[rowalign="center"] > mjx-mtd': {
      'vertical-align': 'middle'
    },
    'mjx-mtr[rowalign="bottom"] > mjx-mtd': {
      'vertical-align': 'bottom'
    },
    'mjx-mtr[rowalign="baseline"] > mjx-mtd': {
      'vertical-align': 'baseline'
    },
    'mjx-mtr[rowalign="axis"] > mjx-mtd': {
      'vertical-align': '.25em'
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    super.toCHTML(parent);
    const align = this.node.attributes.get('rowalign') ;
    if (align !== 'baseline') {
      this.adaptor.setAttribute(this.chtml, 'rowalign', align);
    }
  }

} CHTMLmtr.__initStatic(); CHTMLmtr.__initStatic2();

/*****************************************************************/
/**
 * The CHTMLlabeledmtr wrapper for the MmlMlabeledtr object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLmlabeledtr extends
CommonMlabeledtrMixin(CHTMLmtr) {

  /**
   * The mlabeledtr wrapper
   */
   static __initStatic3() {this.kind = MmlMlabeledtr.prototype.kind;}

  /**
   * @override
   */
   static __initStatic4() {this.styles = {
    'mjx-mlabeledtr': {
      display: 'table-row'
    },
    'mjx-mlabeledtr[rowalign="top"] > mjx-mtd': {
      'vertical-align': 'top'
    },
    'mjx-mlabeledtr[rowalign="center"] > mjx-mtd': {
      'vertical-align': 'middle'
    },
    'mjx-mlabeledtr[rowalign="bottom"] > mjx-mtd': {
      'vertical-align': 'bottom'
    },
    'mjx-mlabeledtr[rowalign="baseline"] > mjx-mtd': {
      'vertical-align': 'baseline'
    },
    'mjx-mlabeledtr[rowalign="axis"] > mjx-mtd': {
      'vertical-align': '.25em'
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    super.toCHTML(parent);
    const child = this.adaptor.firstChild(this.chtml) ;
    if (child) {
      //
      // Remove label and put it into the labels box inside a row
      //
      this.adaptor.remove(child);
      const align = this.node.attributes.get('rowalign') ;
      const attr = (align !== 'baseline' && align !== 'axis' ? {rowalign: align} : {});
      const row = this.html('mjx-mtr', attr, [child]);
      (CHTMLmtr ).used = true;
      this.adaptor.append((this.parent ).labels, row);
    }
  }

} CHTMLmlabeledtr.__initStatic3(); CHTMLmlabeledtr.__initStatic4();

/*****************************************************************/
/**
 * The CommonMtd interface
 */








/*****************************************************************/
/**
 *  The CommonMtd wrapper mixin for the MmlMtd object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMtdMixin(Base) {

  return class extends Base {

    /**
     * @override
     */
    get fixesPWidth() {
      return false;
    }

    /**
     * @override
     */
     invalidateBBox() {
      this.bboxComputed = false;
    }

    /**
     * @override
     */
     getWrapWidth(_j) {
      const table = this.parent.parent ;
      const row = this.parent ;
      const i = this.node.childPosition() - (row.labeled ? 1 : 0);
      return (typeof(table.cWidths[i]) === 'number' ? table.cWidths[i] : table.getTableData().W[i]) ;
    }

    /**
     * @override
     */
     getChildAlign(_i) {
      return this.node.attributes.get('columnalign') ;
    }

  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 * The CHTMLmtd wrapper for the MmlMtd object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmtd extends
CommonMtdMixin(CHTMLWrapper) {

  /**
   * The mtd wrapper
   */
   static __initStatic() {this.kind = MmlMtd.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-mtd': {
      display: 'table-cell',
      'text-align': 'center',
      'padding': '.215em .4em'
    },
    'mjx-mtd:first-child': {
      'padding-left': 0
    },
    'mjx-mtd:last-child': {
      'padding-right': 0
    },
    'mjx-mtable > * > mjx-itable > *:first-child > mjx-mtd': {
      'padding-top': 0
    },
    'mjx-mtable > * > mjx-itable > *:last-child > mjx-mtd': {
      'padding-bottom': 0
    },
    'mjx-tstrut': {
      display: 'inline-block',
      height: '1em',
      'vertical-align': '-.25em'
    },
    'mjx-labels[align="left"] > mjx-mtr > mjx-mtd': {
      'text-align': 'left'
    },
    'mjx-labels[align="right"] > mjx-mtr > mjx-mtd': {
      'text-align': 'right'
    },
    'mjx-mtr mjx-mtd[rowalign="top"], mjx-mlabeledtr mjx-mtd[rowalign="top"]': {
      'vertical-align': 'top'
    },
    'mjx-mtr mjx-mtd[rowalign="center"], mjx-mlabeledtr mjx-mtd[rowalign="center"]': {
      'vertical-align': 'middle'
    },
    'mjx-mtr mjx-mtd[rowalign="bottom"], mjx-mlabeledtr mjx-mtd[rowalign="bottom"]': {
      'vertical-align': 'bottom'
    },
    'mjx-mtr mjx-mtd[rowalign="baseline"], mjx-mlabeledtr mjx-mtd[rowalign="baseline"]': {
      'vertical-align': 'baseline'
    },
    'mjx-mtr mjx-mtd[rowalign="axis"], mjx-mlabeledtr mjx-mtd[rowalign="axis"]': {
      'vertical-align': '.25em'
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    super.toCHTML(parent);
    const ralign = this.node.attributes.get('rowalign') ;
    const calign = this.node.attributes.get('columnalign') ;
    const palign = this.parent.node.attributes.get('rowalign') ;
    if (ralign !== palign) {
      this.adaptor.setAttribute(this.chtml, 'rowalign', ralign);
    }
    if (calign !== 'center' &&
        (this.parent.kind !== 'mlabeledtr' || this !== this.parent.childNodes[0] ||
         calign !== this.parent.parent.node.attributes.get('side'))) {
      this.adaptor.setStyle(this.chtml, 'textAlign', calign);
    }
    //
    // Include a strut to force minimum height and depth
    //
    this.adaptor.append(this.chtml, this.html('mjx-tstrut'));
  }

} CHTMLmtd.__initStatic(); CHTMLmtd.__initStatic2();

/*****************************************************************/
/**
 * The types needed to define the actiontypes
 *
 * @template W  The maction wrapper type
 */








/**
 * Data used for tooltip actions
 */
const TooltipData = {
  dx: '.2em',          // x-offset of tooltip from right side of maction bbox
  dy: '.1em',          // y-offset of tooltip from bottom of maction bbox

  postDelay: 600,      // milliseconds before tooltip posts
  clearDelay: 100,     // milliseconds before tooltip is removed

  hoverTimer: new Map(),    // timers for posting tooltips
  clearTimer: new Map(),    // timers for removing tooltips

  /*
   * clear the timers if any are active
   */
  stopTimers: (node, data) => {
    if (data.clearTimer.has(node)) {
      clearTimeout(data.clearTimer.get(node));
      data.clearTimer.delete(node);
    }
    if (data.hoverTimer.has(node)) {
      clearTimeout(data.hoverTimer.get(node));
      data.hoverTimer.delete(node);
    }
  }

};

/*****************************************************************/
/**
 * The CommonMaction interface
 *
 * @template W  The maction wrapper type
 */







































/*****************************************************************/
/**
 * The CommonMaction wrapper mixin for the MmlMaction object
 *
 * @template W  The maction wrapper type
 * @template T  The Wrapper class constructor type
 */
function CommonMactionMixin


(Base) {

  return class extends Base {

    /**
     * The handler for the specified actiontype
     */
    
    /**
     * The data for the specified actiontype
     */
    

    /**
     * The x-offset for tooltips
     */
    
    /**
     * The y-offset for tooltips
     */
    

    /**
     * @return {W}  The selected child wrapper
     */
     get selected() {
      const selection = this.node.attributes.get('selection') ;
      const i = Math.max(1, Math.min(this.childNodes.length, selection)) - 1;
      return this.childNodes[i] || this.wrap((this.node ).selected);
    }

    /*************************************************************/

    /**
     * @override
     */
    constructor(...args) {
      super(...args);
      const actions = (this.constructor ).actions;
      const action = this.node.attributes.get('actiontype') ;
      const [handler, data] = actions.get(action) || [((_node, _data) => {}) , {}];
      this.action = handler;
      this.data = data;
      this.getParameters();
    }

    /**
     * Look up attribute parameters
     */
     getParameters() {
      const offsets = this.node.attributes.get('data-offsets') ;
      let [dx, dy] = split(offsets || '');
      this.dx = this.length2em(dx || TooltipData.dx);
      this.dy = this.length2em(dy || TooltipData.dy);
    }

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      bbox.updateFrom(this.selected.getBBox());
      this.selected.setChildPWidths(recompute);
    }

  };

}

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */



/*****************************************************************/
/**
 * The CHTMLmaction wrapper for the MmlMaction object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmaction extends
CommonMactionMixin(CHTMLWrapper) {

  /**
   * The maction wrapper
   */
   static __initStatic() {this.kind = MmlMaction.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-maction': {
      position: 'relative'
    },
    'mjx-maction > mjx-tool': {
      display: 'none',
      position: 'absolute',
      bottom: 0, right: 0,
      width: 0, height: 0,
      'z-index': 500
    },
    'mjx-tool > mjx-tip': {
      display: 'inline-block',
      padding: '.2em',
      border: '1px solid #888',
      'font-size': '70%',
      'background-color': '#F8F8F8',
      color: 'black',
      'box-shadow': '2px 2px 5px #AAAAAA'
    },
    'mjx-maction[toggle]': {
      cursor: 'pointer'
    },
    'mjx-status': {
      display: 'block',
      position: 'fixed',
      left: '1em',
      bottom: '1em',
      'min-width': '25%',
      padding: '.2em .4em',
      border: '1px solid #888',
      'font-size': '90%',
      'background-color': '#F8F8F8',
      color: 'black'
    }
  };}

  /**
   * The valid action types and their handlers
   */
   static __initStatic3() {this.actions = new Map([
    ['toggle', [(node, _data) => {
      //
      // Mark which child is selected
      //
      node.adaptor.setAttribute(node.chtml, 'toggle', node.node.attributes.get('selection') );
      //
      // Cache the data needed to select another node
      //
      const math = node.factory.jax.math;
      const document = node.factory.jax.document;
      const mml = node.node ;
      //
      // Add a click handler that changes the selection and rerenders the expression
      //
      node.setEventHandler('click', (event) => {
        if (!math.end.node) {
          //
          // If the MathItem was created by hand, it might not have a node
          // telling it where to replace the existing math, so set it.
          //
          math.start.node = math.end.node = math.typesetRoot;
          math.start.n = math.end.n = 0;
        }
        mml.nextToggleSelection();
        math.rerender(document);
        event.stopPropagation();
      });
    }, {}]],

    ['tooltip', [(node, data) => {
      const tip = node.childNodes[1];
      if (!tip) return;
      if (tip.node.isKind('mtext')) {
        //
        // Text tooltips are handled through title attributes
        //
        const text = (tip.node ).getText();
        node.adaptor.setAttribute(node.chtml, 'title', text);
      } else {
        //
        // Math tooltips are handled through hidden nodes and event handlers
        //
        const adaptor = node.adaptor;
        const tool = adaptor.append(node.chtml, node.html('mjx-tool', {
          style: {bottom: node.em(-node.dy), right: node.em(-node.dx)}
        }, [node.html('mjx-tip')]));
        tip.toCHTML(adaptor.firstChild(tool));
        //
        // Set up the event handlers to display and remove the tooltip
        //
        node.setEventHandler('mouseover', (event) => {
          data.stopTimers(node, data);
          const timeout = setTimeout(() => adaptor.setStyle(tool, 'display', 'block'), data.postDelay);
          data.hoverTimer.set(node, timeout);
          event.stopPropagation();
        });
        node.setEventHandler('mouseout',  (event) => {
          data.stopTimers(node, data);
          const timeout = setTimeout(() => adaptor.setStyle(tool, 'display', ''), data.clearDelay);
          data.clearTimer.set(node, timeout);
          event.stopPropagation();
        });
      }
    }, TooltipData]],

    ['statusline', [(node, data) => {
      const tip = node.childNodes[1];
      if (!tip) return;
      if (tip.node.isKind('mtext')) {
        const adaptor = node.adaptor;
        const text = (tip.node ).getText();
        adaptor.setAttribute(node.chtml, 'statusline', text);
        //
        // Set up event handlers to change the status window
        //
        node.setEventHandler('mouseover', (event) => {
          if (data.status === null) {
            const body = adaptor.body(adaptor.document);
            data.status = adaptor.append(body, node.html('mjx-status', {}, [node.text(text)]));
          }
          event.stopPropagation();
        });
        node.setEventHandler('mouseout', (event) => {
          if (data.status) {
            adaptor.remove(data.status);
            data.status = null;
          }
          event.stopPropagation();
        });
      }
    }, {
      status: null  // cached status line
    }]]

  ] );}

  /*************************************************************/

  /**
   * @override
   */
   toCHTML(parent) {
    const chtml = this.standardCHTMLnode(parent);
    const child = this.selected;
    child.toCHTML(chtml);
    this.action(this, this.data);
  }

  /**
   * Add an event handler to the output for this maction
   */
   setEventHandler(type, handler) {
    (this.chtml ).addEventListener(type, handler);
  }

} CHTMLmaction.__initStatic(); CHTMLmaction.__initStatic2(); CHTMLmaction.__initStatic3();

/*****************************************************************/
/**
 * The CommonMglyph interface
 */



















/*****************************************************************/
/**
 * The CommonMglyph wrapper mixin for the MmlMglyph object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonMglyphMixin(Base) {

  return class extends Base {

    /**
     * The image's width converted to em's
     */
    
    /**
     * The image's height converted to em's
     */
    
    /**
     * The image's valign values converted to em's
     */
    

    /**
     * @override
     * @constructor
     */
    constructor(...args) {
      super(...args);
      this.getParameters();
    }

    /**
     * Obtain the width, height, and valign.
     * Note:  Currently, the width and height must be specified explicitly, or they default to 1em
     *   Since loading the image may be asynchronous, it would require a restart.
     *   A future extension could implement this either by subclassing this object, or
     *   perhaps as a post-filter on the MathML input jax that adds the needed dimensions
     */
     getParameters() {
      const {width, height, valign} = this.node.attributes.getList('width', 'height', 'valign');
      this.width = (width === 'auto' ? 1 : this.length2em(width));
      this.height = (height === 'auto' ? 1 : this.length2em(height));
      this.valign = this.length2em(valign || '0');
    }

    /**
     * @override
     */
     computeBBox(bbox, _recompute = false) {
      bbox.w = this.width;
      bbox.h = this.height + this.valign;
      bbox.d = -this.valign;
    }

  };

}

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 * The CHTMLmglyph wrapper for the MmlMglyph object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLmglyph extends
CommonMglyphMixin(CHTMLWrapper) {

  /**
   * The mglyph wrapper
   */
   static __initStatic() {this.kind = MmlMglyph.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.styles = {
    'mjx-mglyph > img': {
      display: 'inline-block',
      border: 0,
      padding: 0
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    const chtml = this.standardCHTMLnode(parent);
    const {src, alt} = this.node.attributes.getList('src', 'alt');
    const styles = {
      width: this.em(this.width),
      height: this.em(this.height)
    };
    if (this.valign) {
      styles.verticalAlign = this.em(this.valign);
    }
    const img = this.html('img', {src: src, style: styles, alt: alt, title: alt});
    this.adaptor.append(chtml, img);
  }

} CHTMLmglyph.__initStatic(); CHTMLmglyph.__initStatic2();

/*****************************************************************/
/**
 * The CommonSemantics interface
 */








/*****************************************************************/
/**
 * The CommonSemantics wrapper mixin for the MmlSemantics object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonSemanticsMixin(Base) {

  return class extends Base {

    /**
     * @override
     */
     computeBBox(bbox, _recompute = false) {
      if (this.childNodes.length) {
        const {w, h, d} = this.childNodes[0].getBBox();
        bbox.w = w;
        bbox.h = h;
        bbox.d = d;
      }
    }
  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 * The CHTMLsemantics wrapper for the MmlSemantics object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLsemantics extends
CommonSemanticsMixin(CHTMLWrapper) {

  /**
   * The semantics wrapper
   */
   static __initStatic() {this.kind = MmlSemantics.prototype.kind;}

  /**
   * @override
   */
   toCHTML(parent) {
    const chtml = this.standardCHTMLnode(parent);
    if (this.childNodes.length) {
      this.childNodes[0].toCHTML(chtml);
    }
  }

} CHTMLsemantics.__initStatic();


/*****************************************************************/
/**
 * The CHTMLannotation wrapper for the MmlAnnotation object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLannotation extends CHTMLWrapper {

  /**
   * The annotation wrapper
   */
   static __initStatic2() {this.kind = MmlAnnotation.prototype.kind;}

  /**
   * @override
   */
   toCHTML(parent) {
    // FIXME:  output as plain text
    super.toCHTML(parent);
  }

  /**
   * @override
   */
   computeBBox() {
    // FIXME:  compute using the DOM, if possible
    return this.bbox;
  }

} CHTMLannotation.__initStatic2();

/*****************************************************************/
/**
 * The CHTMLannotationXML wrapper for the MmlAnnotationXML object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLannotationXML extends CHTMLWrapper {

  /**
   * The annotation-xml wrapper
   */
   static __initStatic3() {this.kind = MmlAnnotationXML.prototype.kind;}

  /**
   * @override
   */
   static __initStatic4() {this.styles = {
    'mjx-annotation-xml': {
      'font-family': 'initial',
      'line-height': 'normal'
    }
  };}

} CHTMLannotationXML.__initStatic3(); CHTMLannotationXML.__initStatic4();

/*****************************************************************/
/**
 * The CHTMLxml wrapper for the XMLNode object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLxml extends CHTMLWrapper {

  /**
   * The xml wrapper
   */
   static __initStatic5() {this.kind = XMLNode.prototype.kind;}

  /**
   * Don't set up inline-block styles for this
   */
   static __initStatic6() {this.autoStyle = false;}

  /**
   * @override
   */
   toCHTML(parent) {
    this.chtml = this.adaptor.append(parent, this.adaptor.clone((this.node ).getXML() ));
  }

  /**
   * @override
   */
   computeBBox(bbox, _recompute = false) {
    const {w, h, d} = this.jax.measureXMLnode((this.node ).getXML() );
    bbox.w = w;
    bbox.h = h;
    bbox.d = d;
  }

  /**
   * @override
   */
   getStyles() {}

  /**
   * @override
   */
   getScale() {}

  /**
   * @override
   */
   getVariant() {}

} CHTMLxml.__initStatic5(); CHTMLxml.__initStatic6();

/*****************************************************************/
/**
 * The CommonTeXAtom interface
 */








/*****************************************************************/
/**
 * The CommonTeXAtom wrapper mixin for the TeXAtom object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonTeXAtomMixin(Base) {

  return class extends Base {

    /**
     * @override
     */
     computeBBox(bbox, recompute = false) {
      super.computeBBox(bbox, recompute);
      if (this.childNodes[0] && this.childNodes[0].bbox.ic) {
        bbox.ic = this.childNodes[0].bbox.ic;
      }
      //
      // Center VCENTER atoms vertically
      //
      if (this.node.texClass === TEXCLASS.VCENTER) {
        const {h, d} = bbox;
        const a = this.font.params.axis_height;
        const dh = ((h + d) / 2 + a) - h;  // new height minus old height
        bbox.h += dh;
        bbox.d -= dh;
      }
    }

  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*****************************************************************/
/**
 * The CHTMLTeXAtom wrapper for the TeXAtom object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLTeXAtom extends
CommonTeXAtomMixin(CHTMLWrapper) {

  /**
   * The TeXAtom wrapper
   */
   static __initStatic() {this.kind = TeXAtom.prototype.kind;}

  /**
   * @override
   */
   toCHTML(parent) {
    super.toCHTML(parent);
    this.adaptor.setAttribute(this.chtml, 'texclass', TEXCLASSNAMES[this.node.texClass]);
    //
    // Center VCENTER atoms vertically
    //
    if (this.node.texClass === TEXCLASS.VCENTER) {
      const bbox = this.childNodes[0].getBBox();  // get unmodified bbox of children
      const {h, d} = bbox;
      const a = this.font.params.axis_height;
      const dh = ((h + d) / 2 + a) - h;  // new height minus old height
      this.adaptor.setStyle(this.chtml, 'verticalAlign', this.em(dh));
    }
  }

} CHTMLTeXAtom.__initStatic();

/*****************************************************************/
/**
 * The CommonTextNode interface
 */














/*****************************************************************/
/**
 *  The CommonTextNode wrapper mixin for the TextNode object
 *
 * @template T  The Wrapper class constructor type
 */
function CommonTextNodeMixin(Base) {

  return class extends Base {

    /**
     * @override
     */
     computeBBox(bbox, _recompute = false) {
      const variant = this.parent.variant;
      const text = (this.node ).getText();
      if (variant === '-explicitFont') {
        //
        // Measure the size of the text (using the DOM if possible)
        //
        const font = this.jax.getFontData(this.parent.styles);
        const {w, h, d} = this.jax.measureText(text, variant, font);
        bbox.h = h;
        bbox.d = d;
        bbox.w = w;
      } else {
        const chars = this.remappedText(text, variant);
        bbox.empty();
        //
        // Loop through the characters and add them in one by one
        //
        for (const char of chars) {
          let [h, d, w, data] = this.getVariantChar(variant, char);
          if (data.unknown) {
            //
            // Measure unknown characters using the DOM (if possible)
            //
            const cbox = this.jax.measureText(String.fromCodePoint(char), variant);
            w = cbox.w;
            h = cbox.h;
            d = cbox.d;
          }
          //
          // Update the bounding box
          //
          bbox.w += w;
          if (h > bbox.h) bbox.h = h;
          if (d > bbox.d) bbox.d = d;
          bbox.ic = data.ic || 0;
          bbox.sk = data.sk || 0;
        }
        if (chars.length > 1) {
          bbox.sk = 0;
        }
        bbox.clean();
      }
    }

    /**
     * @param {string} text     The text to remap
     * @param {string} variant  The variant for the character
     * @return {number[]}       The unicode points for the (remapped) text
     */
     remappedText(text, variant) {
      const c = this.parent.stretch.c;
      return (c ? [c] : this.parent.remapChars(this.unicodeChars(text, variant)));
    }

    /******************************************************/
    /*
     * TextNodes don't need these, since these properties
     *   are inherited from the parent nodes
     */

    /**
     * @override
     */
     getStyles() {}

    /**
     * @override
     */
     getVariant() {}

    /**
     * @override
     */
     getScale() {}

    /**
     * @override
     */
     getSpace() {}

  };

}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 *  The CHTMLTextNode wrapper for the TextNode object
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
// @ts-ignore
class CHTMLTextNode extends
CommonTextNodeMixin(CHTMLWrapper) {

  /**
   * The TextNode wrapper
   */
   static __initStatic() {this.kind = TextNode.prototype.kind;}

  /**
   * @override
   */
   static __initStatic2() {this.autoStyle = false;}

  /**
   * @override
   */
   static __initStatic3() {this.styles = {
    'mjx-c': {
      display: 'inline-block'
    },
    'mjx-utext': {
      display: 'inline-block',
      padding: '.75em 0 .2em 0'
    }
  };}

  /**
   * @override
   */
   toCHTML(parent) {
    this.markUsed();
    const adaptor = this.adaptor;
    const variant = this.parent.variant;
    const text = (this.node ).getText();
    if (variant === '-explicitFont') {
      const font = this.jax.getFontData(this.parent.styles);
      adaptor.append(parent, this.jax.unknownText(text, variant, font));
    } else {
      const chars = this.remappedText(text, variant);
      for (const n of chars) {
        const data = this.getVariantChar(variant, n)[3];
        const font = (data.f ? ' TEX-' + data.f : '');
        const node = (data.unknown ?
                      this.jax.unknownText(String.fromCodePoint(n), variant) :
                      this.html('mjx-c', {class: this.char(n) + font}));
        adaptor.append(parent, node);
        data.used = true;
      }
    }
  }

} CHTMLTextNode.__initStatic(); CHTMLTextNode.__initStatic2(); CHTMLTextNode.__initStatic3();

const CHTMLWrappers  = {
  [CHTMLmath.kind]: CHTMLmath,
  [CHTMLmrow.kind]: CHTMLmrow,
  [CHTMLinferredMrow.kind]: CHTMLinferredMrow,
  [CHTMLmi.kind]: CHTMLmi,
  [CHTMLmo.kind]: CHTMLmo,
  [CHTMLmn.kind]: CHTMLmn,
  [CHTMLms.kind]: CHTMLms,
  [CHTMLmtext.kind]: CHTMLmtext,
  [CHTMLmspace.kind]: CHTMLmspace,
  [CHTMLmpadded.kind]: CHTMLmpadded,
  [CHTMLmenclose.kind]: CHTMLmenclose,
  [CHTMLmfrac.kind]: CHTMLmfrac,
  [CHTMLmsqrt.kind]: CHTMLmsqrt,
  [CHTMLmroot.kind]: CHTMLmroot,
  [CHTMLmsub.kind]: CHTMLmsub,
  [CHTMLmsup.kind]: CHTMLmsup,
  [CHTMLmsubsup.kind]: CHTMLmsubsup,
  [CHTMLmunder.kind]: CHTMLmunder,
  [CHTMLmover.kind]: CHTMLmover,
  [CHTMLmunderover.kind]: CHTMLmunderover,
  [CHTMLmmultiscripts.kind]: CHTMLmmultiscripts,
  [CHTMLmfenced.kind]: CHTMLmfenced,
  [CHTMLmtable.kind]: CHTMLmtable,
  [CHTMLmtr.kind]: CHTMLmtr,
  [CHTMLmlabeledtr.kind]: CHTMLmlabeledtr,
  [CHTMLmtd.kind]: CHTMLmtd,
  [CHTMLmaction.kind]: CHTMLmaction,
  [CHTMLmglyph.kind]: CHTMLmglyph,
  [CHTMLsemantics.kind]: CHTMLsemantics,
  [CHTMLannotation.kind]: CHTMLannotation,
  [CHTMLannotationXML.kind]: CHTMLannotationXML,
  [CHTMLxml.kind]: CHTMLxml,
  [CHTMLTeXAtom.kind]: CHTMLTeXAtom,
  [CHTMLTextNode.kind]: CHTMLTextNode,
  [CHTMLWrapper.kind]: CHTMLWrapper
};

/*****************************************************************/
/**
 *  The CHTMLWrapperFactory class for creating CHTMLWrapper nodes
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTMLWrapperFactory extends
CommonWrapperFactory






 {

  /**
   * The default list of wrapper nodes this factory can create
   */
   static __initStatic() {this.defaultNodes = CHTMLWrappers;}

  /**
   * The CHTML output jax associated with this factory
   */
  

} CHTMLWrapperFactory.__initStatic();

var _class$a;
























/*****************************************************************/
/**
 *  The CommonTeXFont mixin for the CommonTeXFont object
 *
 * @template C  The CharOptions class for this font
 * @template V  The VariantData class for this font
 * @template B  The FontData class to extend
 */
function CommonTeXFontMixin




(Base) {

  return (_class$a = class extends Base {

    /**
     *  Add the extra variants for the TeX fonts
     */
     static __initStatic() {this.defaultVariants = [
      ...Base.defaultVariants,
      ['-smallop', 'normal'],
      ['-largeop', 'normal'],
      ['-size3', 'normal'],
      ['-size4', 'normal'],
      ['-tex-calligraphic', 'italic'],
      ['-tex-bold-calligraphic', 'bold-italic'],
      ['-tex-oldstyle', 'normal'],
      ['-tex-bold-oldstyle', 'bold'],
      ['-tex-mathit', 'italic'],
      ['-tex-variant', 'normal']
    ];}

    /**
     * The data used for CSS for undefined characters for each variant
     */
     static __initStatic2() {this.defaultCssFonts = {
      ...Base.defaultCssFonts,
      '-smallop': ['serif', false, false],
      '-largeop': ['serif', false, false],
      '-size3': ['serif', false, false],
      '-size4': ['serif', false, false],
      '-tex-calligraphic': ['cursive', true, false],
      '-tex-bold-calligraphic': ['cursive', true, true],
      '-tex-oldstyle': ['serif', false, false],
      '-tex-bold-oldstyle': ['serif', false, true],
      '-tex-mathit': ['serif', true, false]
    };}

    /**
     *  The default variants for the standard stretchy sizes
     */
     static __initStatic3() {this.defaultSizeVariants = ['normal', '-smallop', '-largeop', '-size3', '-size4'];}

    /**
     * @override
     */
     getDelimiterData(n) {
      return this.getChar('-smallop', n) || this.getChar('-size4', n);
    }

  }, _class$a.__initStatic(), _class$a.__initStatic2(), _class$a.__initStatic3(), _class$a);

}

const boldItalic = {
    0x2F: [.711, .21, .894],
    0x131: [.452, .008, .394, {sk: .0319}],
    0x237: [.451, .201, .439, {sk: .0958}],
    0x2044: [.711, .21, .894],
    0x2206: [.711, 0, .958, {sk: .192}],
    0x29F8: [.711, .21, .894],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const boldItalic$1 = AddCSS(boldItalic, {
    0x131: {f: 'B'},
    0x237: {f: 'B'},
    0x2044: {c: '/'},
    0x2206: {c: '\\394'},
    0x29F8: {c: '/'},
});

const bold = {
    0x21: [.705, 0, .35],
    0x22: [.694, -0.329, .603],
    0x23: [.694, .193, .958],
    0x24: [.75, .056, .575],
    0x25: [.75, .056, .958],
    0x26: [.705, .011, .894],
    0x27: [.694, -0.329, .319],
    0x28: [.75, .249, .447],
    0x29: [.75, .249, .447],
    0x2A: [.75, -0.306, .575],
    0x2B: [.633, .131, .894],
    0x2C: [.171, .194, .319],
    0x2D: [.278, -0.166, .383],
    0x2E: [.171, 0, .319],
    0x2F: [.75, .25, .575],
    0x3A: [.444, 0, .319],
    0x3B: [.444, .194, .319],
    0x3C: [.587, .085, .894],
    0x3D: [.393, -0.109, .894],
    0x3E: [.587, .085, .894],
    0x3F: [.7, 0, .543],
    0x40: [.699, .006, .894],
    0x5B: [.75, .25, .319],
    0x5C: [.75, .25, .575],
    0x5D: [.75, .25, .319],
    0x5E: [.694, -0.52, .575],
    0x5F: [-0.01, .061, .575],
    0x60: [.706, -0.503, .575],
    0x7B: [.75, .25, .575],
    0x7C: [.75, .249, .319],
    0x7D: [.75, .25, .575],
    0x7E: [.344, -0.202, .575],
    0xA8: [.695, -0.535, .575],
    0xAC: [.371, -0.061, .767],
    0xAF: [.607, -0.54, .575],
    0xB0: [.702, -0.536, .575],
    0xB1: [.728, .035, .894],
    0xB4: [.706, -0.503, .575],
    0xB7: [.336, -0.166, .319],
    0xD7: [.53, .028, .894],
    0xF7: [.597, .096, .894],
    0x131: [.442, 0, .278, {sk: .0278}],
    0x237: [.442, .205, .306, {sk: .0833}],
    0x2B9: [.563, -0.033, .344],
    0x2C6: [.694, -0.52, .575],
    0x2C7: [.66, -0.515, .575],
    0x2C9: [.607, -0.54, .575],
    0x2CA: [.706, -0.503, .575],
    0x2CB: [.706, -0.503, .575],
    0x2D8: [.694, -0.5, .575],
    0x2D9: [.695, -0.525, .575],
    0x2DA: [.702, -0.536, .575],
    0x2DC: [.694, -0.552, .575],
    0x300: [.706, -0.503, 0],
    0x301: [.706, -0.503, 0],
    0x302: [.694, -0.52, 0],
    0x303: [.694, -0.552, 0],
    0x304: [.607, -0.54, 0],
    0x306: [.694, -0.5, 0],
    0x307: [.695, -0.525, 0],
    0x308: [.695, -0.535, 0],
    0x30A: [.702, -0.536, 0],
    0x30B: [.714, -0.511, 0],
    0x30C: [.66, -0.515, 0],
    0x338: [.711, .21, 0],
    0x2002: [0, 0, .5],
    0x2003: [0, 0, .999],
    0x2004: [0, 0, .333],
    0x2005: [0, 0, .25],
    0x2006: [0, 0, .167],
    0x2009: [0, 0, .167],
    0x200A: [0, 0, .083],
    0x2013: [.3, -0.249, .575],
    0x2014: [.3, -0.249, 1.15],
    0x2015: [.3, -0.249, 1.15],
    0x2016: [.75, .248, .575],
    0x2017: [-0.01, .061, .575],
    0x2018: [.694, -0.329, .319],
    0x2019: [.694, -0.329, .319],
    0x201C: [.694, -0.329, .603],
    0x201D: [.694, -0.329, .603],
    0x2020: [.702, .211, .511],
    0x2021: [.702, .202, .511],
    0x2022: [.474, -0.028, .575],
    0x2026: [.171, 0, 1.295],
    0x2032: [.563, -0.033, .344],
    0x2033: [.563, 0, .688],
    0x2034: [.563, 0, 1.032],
    0x203E: [.607, -0.54, .575],
    0x2044: [.75, .25, .575],
    0x2057: [.563, 0, 1.376],
    0x20D7: [.723, -0.513, .575],
    0x210F: [.694, .008, .668, {sk: -0.0319}],
    0x2113: [.702, .019, .474, {sk: .128}],
    0x2118: [.461, .21, .74],
    0x2135: [.694, 0, .703],
    0x2190: [.518, .017, 1.15],
    0x2191: [.694, .193, .575],
    0x2192: [.518, .017, 1.15],
    0x2193: [.694, .194, .575],
    0x2194: [.518, .017, 1.15],
    0x2195: [.767, .267, .575],
    0x2196: [.724, .194, 1.15],
    0x2197: [.724, .193, 1.15],
    0x2198: [.694, .224, 1.15],
    0x2199: [.694, .224, 1.15],
    0x219A: [.711, .21, 1.15],
    0x219B: [.711, .21, 1.15],
    0x21A6: [.518, .017, 1.15],
    0x21A9: [.518, .017, 1.282],
    0x21AA: [.518, .017, 1.282],
    0x21AE: [.711, .21, 1.15],
    0x21BC: [.518, -0.22, 1.15],
    0x21BD: [.281, .017, 1.15],
    0x21C0: [.518, -0.22, 1.15],
    0x21C1: [.281, .017, 1.15],
    0x21CC: [.718, .017, 1.15],
    0x21CD: [.711, .21, 1.15],
    0x21CE: [.711, .21, 1.15],
    0x21CF: [.711, .21, 1.15],
    0x21D0: [.547, .046, 1.15],
    0x21D1: [.694, .193, .703],
    0x21D2: [.547, .046, 1.15],
    0x21D3: [.694, .194, .703],
    0x21D4: [.547, .046, 1.15],
    0x21D5: [.767, .267, .703],
    0x2200: [.694, .016, .639],
    0x2203: [.694, 0, .639],
    0x2204: [.711, .21, .639],
    0x2205: [.767, .073, .575],
    0x2206: [.698, 0, .958],
    0x2208: [.587, .086, .767],
    0x2209: [.711, .21, .767],
    0x220B: [.587, .086, .767],
    0x220C: [.711, .21, .767],
    0x2212: [.281, -0.221, .894],
    0x2213: [.537, .227, .894],
    0x2215: [.75, .25, .575],
    0x2216: [.75, .25, .575],
    0x2217: [.472, -0.028, .575],
    0x2218: [.474, -0.028, .575],
    0x2219: [.474, -0.028, .575],
    0x221A: [.82, .18, .958, {ic: .03}],
    0x221D: [.451, .008, .894],
    0x221E: [.452, .008, 1.15],
    0x2220: [.714, 0, .722],
    0x2223: [.75, .249, .319],
    0x2224: [.75, .249, .319],
    0x2225: [.75, .248, .575],
    0x2226: [.75, .248, .575],
    0x2227: [.604, .017, .767],
    0x2228: [.604, .016, .767],
    0x2229: [.603, .016, .767],
    0x222A: [.604, .016, .767],
    0x222B: [.711, .211, .569, {ic: .063}],
    0x223C: [.391, -0.109, .894],
    0x2240: [.583, .082, .319],
    0x2241: [.711, .21, .894],
    0x2243: [.502, 0, .894],
    0x2244: [.711, .21, .894],
    0x2245: [.638, .027, .894],
    0x2247: [.711, .21, .894],
    0x2248: [.524, -0.032, .894],
    0x2249: [.711, .21, .894],
    0x224D: [.533, .032, .894],
    0x2250: [.721, -0.109, .894],
    0x2260: [.711, .21, .894],
    0x2261: [.505, 0, .894],
    0x2262: [.711, .21, .894],
    0x2264: [.697, .199, .894],
    0x2265: [.697, .199, .894],
    0x226A: [.617, .116, 1.15],
    0x226B: [.618, .116, 1.15],
    0x226D: [.711, .21, .894],
    0x226E: [.711, .21, .894],
    0x226F: [.711, .21, .894],
    0x2270: [.711, .21, .894],
    0x2271: [.711, .21, .894],
    0x227A: [.585, .086, .894],
    0x227B: [.586, .086, .894],
    0x2280: [.711, .21, .894],
    0x2281: [.711, .21, .894],
    0x2282: [.587, .085, .894],
    0x2283: [.587, .086, .894],
    0x2284: [.711, .21, .894],
    0x2285: [.711, .21, .894],
    0x2286: [.697, .199, .894],
    0x2287: [.697, .199, .894],
    0x2288: [.711, .21, .894],
    0x2289: [.711, .21, .894],
    0x228E: [.604, .016, .767],
    0x2291: [.697, .199, .894],
    0x2292: [.697, .199, .894],
    0x2293: [.604, 0, .767],
    0x2294: [.604, 0, .767],
    0x2295: [.632, .132, .894],
    0x2296: [.632, .132, .894],
    0x2297: [.632, .132, .894],
    0x2298: [.632, .132, .894],
    0x2299: [.632, .132, .894],
    0x22A2: [.693, 0, .703],
    0x22A3: [.693, 0, .703],
    0x22A4: [.694, 0, .894],
    0x22A5: [.693, 0, .894],
    0x22A8: [.75, .249, .974],
    0x22AC: [.711, .21, .703],
    0x22AD: [.75, .249, .974],
    0x22C4: [.523, .021, .575],
    0x22C5: [.336, -0.166, .319],
    0x22C6: [.502, 0, .575],
    0x22C8: [.54, .039, 1],
    0x22E2: [.711, .21, .894],
    0x22E3: [.711, .21, .894],
    0x22EE: [.951, .029, .319],
    0x22EF: [.336, -0.166, 1.295],
    0x22F1: [.871, -0.101, 1.323],
    0x2308: [.75, .248, .511],
    0x2309: [.75, .248, .511],
    0x230A: [.749, .248, .511],
    0x230B: [.749, .248, .511],
    0x2322: [.405, -0.108, 1.15],
    0x2323: [.392, -0.126, 1.15],
    0x2329: [.75, .249, .447],
    0x232A: [.75, .249, .447],
    0x25B3: [.711, 0, 1.022],
    0x25B5: [.711, 0, 1.022],
    0x25B9: [.54, .039, .575],
    0x25BD: [.5, .21, 1.022],
    0x25BF: [.5, .21, 1.022],
    0x25C3: [.539, .038, .575],
    0x25EF: [.711, .211, 1.15],
    0x2660: [.719, .129, .894],
    0x2661: [.711, .024, .894],
    0x2662: [.719, .154, .894],
    0x2663: [.719, .129, .894],
    0x266D: [.75, .017, .447],
    0x266E: [.741, .223, .447],
    0x266F: [.724, .224, .447],
    0x2758: [.75, .249, .319],
    0x27E8: [.75, .249, .447],
    0x27E9: [.75, .249, .447],
    0x27F5: [.518, .017, 1.805],
    0x27F6: [.518, .017, 1.833],
    0x27F7: [.518, .017, 2.126],
    0x27F8: [.547, .046, 1.868],
    0x27F9: [.547, .046, 1.87],
    0x27FA: [.547, .046, 2.126],
    0x27FC: [.518, .017, 1.833],
    0x29F8: [.711, .21, .894],
    0x2A2F: [.53, .028, .894],
    0x2A3F: [.686, 0, .9],
    0x2AAF: [.696, .199, .894],
    0x2AB0: [.697, .199, .894],
    0x3008: [.75, .249, .447],
    0x3009: [.75, .249, .447],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const bold$1 = AddCSS(bold, {
    0xB7: {c: '\\22C5'},
    0x131: {f: ''},
    0x237: {f: ''},
    0x2B9: {c: '\\2032'},
    0x2002: {c: ''},
    0x2003: {c: ''},
    0x2004: {c: ''},
    0x2005: {c: ''},
    0x2006: {c: ''},
    0x2009: {c: ''},
    0x200A: {c: ''},
    0x2015: {c: '\\2014'},
    0x2016: {c: '\\2225'},
    0x2017: {c: '_'},
    0x2022: {c: '\\2219'},
    0x2033: {c: '\\2032\\2032'},
    0x2034: {c: '\\2032\\2032\\2032'},
    0x203E: {c: '\\2C9'},
    0x2044: {c: '/'},
    0x2057: {c: '\\2032\\2032\\2032\\2032'},
    0x20D7: {c: '\\2192', f: 'VB'},
    0x219A: {c: '\\2190\\338'},
    0x219B: {c: '\\2192\\338'},
    0x21AE: {c: '\\2194\\338'},
    0x21CD: {c: '\\21D0\\338'},
    0x21CE: {c: '\\21D4\\338'},
    0x21CF: {c: '\\21D2\\338'},
    0x2204: {c: '\\2203\\338'},
    0x2206: {c: '\\394'},
    0x220C: {c: '\\220B\\338'},
    0x2224: {c: '\\2223\\338'},
    0x2226: {c: '\\2225\\338'},
    0x2241: {c: '\\223C\\338'},
    0x2244: {c: '\\2243\\338'},
    0x2247: {c: '\\2245\\338'},
    0x2249: {c: '\\2248\\338'},
    0x2262: {c: '\\2261\\338'},
    0x226D: {c: '\\224D\\338'},
    0x226E: {c: '<\\338'},
    0x226F: {c: '>\\338'},
    0x2270: {c: '\\2264\\338'},
    0x2271: {c: '\\2265\\338'},
    0x2280: {c: '\\227A\\338'},
    0x2281: {c: '\\227B\\338'},
    0x2284: {c: '\\2282\\338'},
    0x2285: {c: '\\2283\\338'},
    0x2288: {c: '\\2286\\338'},
    0x2289: {c: '\\2287\\338'},
    0x22AC: {c: '\\22A2\\338'},
    0x22AD: {c: '\\22A8\\338'},
    0x22E2: {c: '\\2291\\338'},
    0x22E3: {c: '\\2292\\338'},
    0x2329: {c: '\\27E8'},
    0x232A: {c: '\\27E9'},
    0x25B5: {c: '\\25B3'},
    0x25BF: {c: '\\25BD'},
    0x2758: {c: '\\2223'},
    0x29F8: {c: '/', f: 'BI'},
    0x2A2F: {c: '\\D7'},
    0x3008: {c: '\\27E8'},
    0x3009: {c: '\\27E9'},
});

const doubleStruck = {
};

const frakturBold = {
    0x21: [.689, .012, .349],
    0x22: [.695, -0.432, .254],
    0x26: [.696, .016, .871],
    0x27: [.695, -0.436, .25],
    0x28: [.737, .186, .459],
    0x29: [.735, .187, .459],
    0x2A: [.692, -0.449, .328],
    0x2B: [.598, .082, .893],
    0x2C: [.107, .191, .328],
    0x2D: [.275, -0.236, .893],
    0x2E: [.102, .015, .328],
    0x2F: [.721, .182, .593],
    0x30: [.501, .012, .593],
    0x31: [.489, 0, .593],
    0x32: [.491, 0, .593],
    0x33: [.487, .193, .593],
    0x34: [.495, .196, .593],
    0x35: [.481, .19, .593],
    0x36: [.704, .012, .593],
    0x37: [.479, .197, .593],
    0x38: [.714, .005, .593],
    0x39: [.487, .195, .593],
    0x3A: [.457, .012, .255],
    0x3B: [.458, .19, .255],
    0x3D: [.343, -0.168, .582],
    0x3F: [.697, .014, .428],
    0x5B: [.74, .13, .257],
    0x5D: [.738, .132, .257],
    0x5E: [.734, -0.452, .59],
    0x2018: [.708, -0.411, .254],
    0x2019: [.692, -0.394, .254],
    0x2044: [.721, .182, .593],
    0xE301: [.63, .027, .587],
    0xE302: [.693, .212, .394, {ic: .014}],
    0xE303: [.681, .219, .387],
    0xE304: [.473, .212, .593],
    0xE305: [.684, .027, .393],
    0xE308: [.679, .22, .981],
    0xE309: [.717, .137, .727],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const frakturBold$1 = AddCSS(frakturBold, {
    0x2044: {c: '/'},
});

const fraktur = {
    0x21: [.689, .012, .296],
    0x22: [.695, -0.432, .215],
    0x26: [.698, .011, .738],
    0x27: [.695, -0.436, .212],
    0x28: [.737, .186, .389],
    0x29: [.735, .187, .389],
    0x2A: [.692, -0.449, .278],
    0x2B: [.598, .082, .756],
    0x2C: [.107, .191, .278],
    0x2D: [.275, -0.236, .756],
    0x2E: [.102, .015, .278],
    0x2F: [.721, .182, .502],
    0x30: [.492, .013, .502],
    0x31: [.468, 0, .502],
    0x32: [.474, 0, .502],
    0x33: [.473, .182, .502],
    0x34: [.476, .191, .502],
    0x35: [.458, .184, .502],
    0x36: [.7, .013, .502],
    0x37: [.468, .181, .502],
    0x38: [.705, .01, .502],
    0x39: [.469, .182, .502],
    0x3A: [.457, .012, .216],
    0x3B: [.458, .189, .216],
    0x3D: [.368, -0.132, .756],
    0x3F: [.693, .011, .362],
    0x5B: [.74, .13, .278],
    0x5D: [.738, .131, .278],
    0x5E: [.734, -0.452, .5],
    0x2018: [.708, -0.41, .215],
    0x2019: [.692, -0.395, .215],
    0x2044: [.721, .182, .502],
    0xE300: [.683, .032, .497],
    0xE301: [.616, .03, .498],
    0xE302: [.68, .215, .333],
    0xE303: [.679, .224, .329],
    0xE304: [.471, .214, .503],
    0xE305: [.686, .02, .333],
    0xE306: [.577, .021, .334, {ic: .013}],
    0xE307: [.475, .022, .501, {ic: .013}],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const fraktur$1 = AddCSS(fraktur, {
    0x2044: {c: '/'},
});

const italic = {
    0x21: [.716, 0, .307, {ic: .073}],
    0x22: [.694, -0.379, .514, {ic: .024}],
    0x23: [.694, .194, .818, {ic: .01}],
    0x25: [.75, .056, .818, {ic: .029}],
    0x26: [.716, .022, .767, {ic: .035}],
    0x27: [.694, -0.379, .307, {ic: .07}],
    0x28: [.75, .25, .409, {ic: .108}],
    0x29: [.75, .25, .409],
    0x2A: [.75, -0.32, .511, {ic: .073}],
    0x2B: [.557, .057, .767],
    0x2C: [.121, .194, .307],
    0x2D: [.251, -0.18, .358],
    0x2E: [.121, 0, .307],
    0x2F: [.716, .215, .778],
    0x30: [.665, .021, .511, {ic: .051}],
    0x31: [.666, 0, .511],
    0x32: [.666, .022, .511, {ic: .04}],
    0x33: [.666, .022, .511, {ic: .051}],
    0x34: [.666, .194, .511],
    0x35: [.666, .022, .511, {ic: .056}],
    0x36: [.665, .022, .511, {ic: .054}],
    0x37: [.666, .022, .511, {ic: .123}],
    0x38: [.666, .021, .511, {ic: .042}],
    0x39: [.666, .022, .511, {ic: .042}],
    0x3A: [.431, 0, .307],
    0x3B: [.431, .194, .307],
    0x3D: [.367, -0.133, .767],
    0x3F: [.716, 0, .511, {ic: .04}],
    0x40: [.705, .011, .767, {ic: .022}],
    0x5B: [.75, .25, .307, {ic: .139}],
    0x5D: [.75, .25, .307, {ic: .052}],
    0x5E: [.694, -0.527, .511, {ic: .017}],
    0x5F: [-0.025, .062, .511, {ic: .043}],
    0x7E: [.318, -0.208, .511, {ic: .06}],
    0x131: [.441, .01, .307, {ic: .033}],
    0x237: [.442, .204, .332],
    0x300: [.697, -0.5, 0],
    0x301: [.697, -0.5, 0, {ic: .039}],
    0x302: [.694, -0.527, 0, {ic: .017}],
    0x303: [.668, -0.558, 0, {ic: .06}],
    0x304: [.589, -0.544, 0, {ic: .054}],
    0x306: [.694, -0.515, 0, {ic: .062}],
    0x307: [.669, -0.548, 0],
    0x308: [.669, -0.554, 0, {ic: .045}],
    0x30A: [.716, -0.542, 0],
    0x30B: [.697, -0.503, 0, {ic: .065}],
    0x30C: [.638, -0.502, 0, {ic: .029}],
    0x3DD: [.605, .085, .778],
    0x2013: [.285, -0.248, .511, {ic: .043}],
    0x2014: [.285, -0.248, 1.022, {ic: .016}],
    0x2015: [.285, -0.248, 1.022, {ic: .016}],
    0x2017: [-0.025, .062, .511, {ic: .043}],
    0x2018: [.694, -0.379, .307, {ic: .055}],
    0x2019: [.694, -0.379, .307, {ic: .07}],
    0x201C: [.694, -0.379, .514, {ic: .092}],
    0x201D: [.694, -0.379, .514, {ic: .024}],
    0x2044: [.716, .215, .778],
    0x210F: [.695, .013, .54, {ic: .022}],
    0x2206: [.716, 0, .833, {sk: .167}],
    0x29F8: [.716, .215, .778],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const italic$1 = AddCSS(italic, {
    0x2F: {f: 'I'},
    0x3DD: {c: '\\E008', f: 'A'},
    0x2015: {c: '\\2014'},
    0x2017: {c: '_'},
    0x2044: {c: '/', f: 'I'},
    0x2206: {c: '\\394', f: 'I'},
    0x29F8: {c: '/', f: 'I'},
});

const largeop = {
    0x28: [1.15, .649, .597],
    0x29: [1.15, .649, .597],
    0x2F: [1.15, .649, .811],
    0x5B: [1.15, .649, .472],
    0x5C: [1.15, .649, .811],
    0x5D: [1.15, .649, .472],
    0x7B: [1.15, .649, .667],
    0x7D: [1.15, .649, .667],
    0x2C6: [.772, -0.565, 1],
    0x2DC: [.75, -0.611, 1],
    0x302: [.772, -0.565, 0],
    0x303: [.75, -0.611, 0],
    0x2016: [.602, 0, .778],
    0x2044: [1.15, .649, .811],
    0x2191: [.6, 0, .667],
    0x2193: [.6, 0, .667],
    0x21D1: [.599, 0, .778],
    0x21D3: [.6, 0, .778],
    0x220F: [.95, .45, 1.278],
    0x2210: [.95, .45, 1.278],
    0x2211: [.95, .45, 1.444],
    0x221A: [1.15, .65, 1, {ic: .02}],
    0x2223: [.627, .015, .333],
    0x2225: [.627, .015, .556],
    0x222B: [1.36, .862, .556, {ic: .388}],
    0x222C: [1.36, .862, 1.084, {ic: .388}],
    0x222D: [1.36, .862, 1.592, {ic: .388}],
    0x222E: [1.36, .862, .556, {ic: .388}],
    0x22C0: [.95, .45, 1.111],
    0x22C1: [.95, .45, 1.111],
    0x22C2: [.949, .45, 1.111],
    0x22C3: [.95, .449, 1.111],
    0x2308: [1.15, .649, .528],
    0x2309: [1.15, .649, .528],
    0x230A: [1.15, .649, .528],
    0x230B: [1.15, .649, .528],
    0x2329: [1.15, .649, .611],
    0x232A: [1.15, .649, .611],
    0x23D0: [.602, 0, .667],
    0x2758: [.627, .015, .333],
    0x27E8: [1.15, .649, .611],
    0x27E9: [1.15, .649, .611],
    0x2A00: [.949, .449, 1.511],
    0x2A01: [.949, .449, 1.511],
    0x2A02: [.949, .449, 1.511],
    0x2A04: [.95, .449, 1.111],
    0x2A06: [.95, .45, 1.111],
    0x2A0C: [1.36, .862, 2.168, {ic: .388}],
    0x3008: [1.15, .649, .611],
    0x3009: [1.15, .649, .611],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const largeop$1 = AddCSS(largeop, {
    0x2016: {f: 'S1'},
    0x2044: {c: '/'},
    0x2191: {f: 'S1'},
    0x2193: {f: 'S1'},
    0x21D1: {f: 'S1'},
    0x21D3: {f: 'S1'},
    0x2223: {f: 'S1'},
    0x2225: {f: 'S1'},
    0x2329: {c: '\\27E8'},
    0x232A: {c: '\\27E9'},
    0x23D0: {f: 'S1'},
    0x2758: {c: '\\2223', f: 'S1'},
    0x2A0C: {c: '\\222C\\222C'},
    0x3008: {c: '\\27E8'},
    0x3009: {c: '\\27E9'},
});

const monospace = {
    0x20: [0, 0, .525],
    0x21: [.622, 0, .525],
    0x22: [.623, -0.333, .525],
    0x23: [.611, 0, .525],
    0x24: [.694, .082, .525],
    0x25: [.694, .083, .525],
    0x26: [.622, .011, .525],
    0x27: [.611, -0.287, .525],
    0x28: [.694, .082, .525],
    0x29: [.694, .082, .525],
    0x2A: [.52, -0.09, .525],
    0x2B: [.531, -0.081, .525],
    0x2C: [.14, .139, .525],
    0x2D: [.341, -0.271, .525],
    0x2E: [.14, 0, .525],
    0x2F: [.694, .083, .525],
    0x3A: [.431, 0, .525],
    0x3B: [.431, .139, .525],
    0x3C: [.557, -0.055, .525],
    0x3D: [.417, -0.195, .525],
    0x3E: [.557, -0.055, .525],
    0x3F: [.617, 0, .525],
    0x40: [.617, .006, .525],
    0x5B: [.694, .082, .525],
    0x5C: [.694, .083, .525],
    0x5D: [.694, .082, .525],
    0x5E: [.611, -0.46, .525],
    0x5F: [-0.025, .095, .525],
    0x60: [.681, -0.357, .525],
    0x7B: [.694, .083, .525],
    0x7C: [.694, .082, .525],
    0x7D: [.694, .083, .525],
    0x7E: [.611, -0.466, .525],
    0x7F: [.612, -0.519, .525],
    0xA0: [0, 0, .525],
    0x131: [.431, 0, .525],
    0x237: [.431, .228, .525],
    0x2B9: [.623, -0.334, .525],
    0x300: [.611, -0.485, 0],
    0x301: [.611, -0.485, 0],
    0x302: [.611, -0.46, 0],
    0x303: [.611, -0.466, 0],
    0x304: [.577, -0.5, 0],
    0x306: [.611, -0.504, 0],
    0x308: [.612, -0.519, 0],
    0x30A: [.619, -0.499, 0],
    0x30C: [.577, -0.449, 0],
    0x391: [.623, 0, .525],
    0x392: [.611, 0, .525],
    0x393: [.611, 0, .525],
    0x394: [.623, 0, .525],
    0x395: [.611, 0, .525],
    0x396: [.611, 0, .525],
    0x397: [.611, 0, .525],
    0x398: [.621, .01, .525],
    0x399: [.611, 0, .525],
    0x39A: [.611, 0, .525],
    0x39B: [.623, 0, .525],
    0x39C: [.611, 0, .525],
    0x39D: [.611, 0, .525],
    0x39E: [.611, 0, .525],
    0x39F: [.621, .01, .525],
    0x3A0: [.611, 0, .525],
    0x3A1: [.611, 0, .525],
    0x3A3: [.611, 0, .525],
    0x3A4: [.611, 0, .525],
    0x3A5: [.622, 0, .525],
    0x3A6: [.611, 0, .525],
    0x3A7: [.611, 0, .525],
    0x3A8: [.611, 0, .525],
    0x3A9: [.622, 0, .525],
    0x2017: [-0.025, .095, .525],
    0x2032: [.623, -0.334, .525],
    0x2033: [.623, 0, 1.05],
    0x2034: [.623, 0, 1.575],
    0x2044: [.694, .083, .525],
    0x2057: [.623, 0, 2.1],
    0x2206: [.623, 0, .525],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const monospace$1 = AddCSS(monospace, {
    0x2B9: {c: '\\2032'},
    0x391: {c: 'A'},
    0x392: {c: 'B'},
    0x395: {c: 'E'},
    0x396: {c: 'Z'},
    0x397: {c: 'H'},
    0x399: {c: 'I'},
    0x39A: {c: 'K'},
    0x39C: {c: 'M'},
    0x39D: {c: 'N'},
    0x39F: {c: 'O'},
    0x3A1: {c: 'P'},
    0x3A4: {c: 'T'},
    0x3A7: {c: 'X'},
    0x2017: {c: '_'},
    0x2033: {c: '\\2032\\2032'},
    0x2034: {c: '\\2032\\2032\\2032'},
    0x2044: {c: '/'},
    0x2057: {c: '\\2032\\2032\\2032\\2032'},
    0x2206: {c: '\\394'},
});

const normal = {
    0x20: [0, 0, .25],
    0x21: [.716, 0, .278],
    0x22: [.694, -0.379, .5],
    0x23: [.694, .194, .833],
    0x24: [.75, .056, .5],
    0x25: [.75, .056, .833],
    0x26: [.716, .022, .778],
    0x27: [.694, -0.379, .278],
    0x28: [.75, .25, .389],
    0x29: [.75, .25, .389],
    0x2A: [.75, -0.32, .5],
    0x2B: [.583, .082, .778],
    0x2C: [.121, .194, .278],
    0x2D: [.252, -0.179, .333],
    0x2E: [.12, 0, .278],
    0x2F: [.75, .25, .5],
    0x30: [.666, .022, .5],
    0x31: [.666, 0, .5],
    0x32: [.666, 0, .5],
    0x33: [.665, .022, .5],
    0x34: [.677, 0, .5],
    0x35: [.666, .022, .5],
    0x36: [.666, .022, .5],
    0x37: [.676, .022, .5],
    0x38: [.666, .022, .5],
    0x39: [.666, .022, .5],
    0x3A: [.43, 0, .278],
    0x3B: [.43, .194, .278],
    0x3C: [.54, .04, .778],
    0x3D: [.583, .082, .778],
    0x3E: [.54, .04, .778],
    0x3F: [.705, 0, .472],
    0x40: [.705, .011, .778],
    0x41: [.716, 0, .75],
    0x42: [.683, 0, .708],
    0x43: [.705, .021, .722],
    0x44: [.683, 0, .764],
    0x45: [.68, 0, .681],
    0x46: [.68, 0, .653],
    0x47: [.705, .022, .785],
    0x48: [.683, 0, .75],
    0x49: [.683, 0, .361],
    0x4A: [.683, .022, .514],
    0x4B: [.683, 0, .778],
    0x4C: [.683, 0, .625],
    0x4D: [.683, 0, .917],
    0x4E: [.683, 0, .75],
    0x4F: [.705, .022, .778],
    0x50: [.683, 0, .681],
    0x51: [.705, .193, .778],
    0x52: [.683, .022, .736],
    0x53: [.705, .022, .556],
    0x54: [.677, 0, .722],
    0x55: [.683, .022, .75],
    0x56: [.683, .022, .75],
    0x57: [.683, .022, 1.028],
    0x58: [.683, 0, .75],
    0x59: [.683, 0, .75],
    0x5A: [.683, 0, .611],
    0x5B: [.75, .25, .278],
    0x5C: [.75, .25, .5],
    0x5D: [.75, .25, .278],
    0x5E: [.694, -0.531, .5],
    0x5F: [-0.025, .062, .5],
    0x60: [.699, -0.505, .5],
    0x61: [.448, .011, .5],
    0x62: [.694, .011, .556],
    0x63: [.448, .011, .444],
    0x64: [.694, .011, .556],
    0x65: [.448, .011, .444],
    0x66: [.705, 0, .306, {ic: .066}],
    0x67: [.453, .206, .5],
    0x68: [.694, 0, .556],
    0x69: [.669, 0, .278],
    0x6A: [.669, .205, .306],
    0x6B: [.694, 0, .528],
    0x6C: [.694, 0, .278],
    0x6D: [.442, 0, .833],
    0x6E: [.442, 0, .556],
    0x6F: [.448, .01, .5],
    0x70: [.442, .194, .556],
    0x71: [.442, .194, .528],
    0x72: [.442, 0, .392],
    0x73: [.448, .011, .394],
    0x74: [.615, .01, .389],
    0x75: [.442, .011, .556],
    0x76: [.431, .011, .528],
    0x77: [.431, .011, .722],
    0x78: [.431, 0, .528],
    0x79: [.431, .204, .528],
    0x7A: [.431, 0, .444],
    0x7B: [.75, .25, .5],
    0x7C: [.75, .249, .278],
    0x7D: [.75, .25, .5],
    0x7E: [.318, -0.215, .5],
    0xA0: [0, 0, .25],
    0xA3: [.714, .011, .769],
    0xA5: [.683, 0, .75],
    0xA8: [.669, -0.554, .5],
    0xAC: [.356, -0.089, .667],
    0xAE: [.709, .175, .947],
    0xAF: [.59, -0.544, .5],
    0xB0: [.715, -0.542, .5],
    0xB1: [.666, 0, .778],
    0xB4: [.699, -0.505, .5],
    0xB7: [.31, -0.19, .278],
    0xD7: [.491, -0.009, .778],
    0xF0: [.749, .021, .556],
    0xF7: [.537, .036, .778],
    0x131: [.442, 0, .278, {sk: .0278}],
    0x237: [.442, .205, .306, {sk: .0833}],
    0x2B9: [.56, -0.043, .275],
    0x2C6: [.694, -0.531, .5],
    0x2C7: [.644, -0.513, .5],
    0x2C9: [.59, -0.544, .5],
    0x2CA: [.699, -0.505, .5],
    0x2CB: [.699, -0.505, .5],
    0x2D8: [.694, -0.515, .5],
    0x2D9: [.669, -0.549, .5],
    0x2DA: [.715, -0.542, .5],
    0x2DC: [.668, -0.565, .5],
    0x300: [.699, -0.505, 0],
    0x301: [.699, -0.505, 0],
    0x302: [.694, -0.531, 0],
    0x303: [.668, -0.565, 0],
    0x304: [.59, -0.544, 0],
    0x306: [.694, -0.515, 0],
    0x307: [.669, -0.549, 0],
    0x308: [.669, -0.554, 0],
    0x30A: [.715, -0.542, 0],
    0x30B: [.701, -0.51, 0],
    0x30C: [.644, -0.513, 0],
    0x338: [.716, .215, 0],
    0x391: [.716, 0, .75],
    0x392: [.683, 0, .708],
    0x393: [.68, 0, .625],
    0x394: [.716, 0, .833],
    0x395: [.68, 0, .681],
    0x396: [.683, 0, .611],
    0x397: [.683, 0, .75],
    0x398: [.705, .022, .778],
    0x399: [.683, 0, .361],
    0x39A: [.683, 0, .778],
    0x39B: [.716, 0, .694],
    0x39C: [.683, 0, .917],
    0x39D: [.683, 0, .75],
    0x39E: [.677, 0, .667],
    0x39F: [.705, .022, .778],
    0x3A0: [.68, 0, .75],
    0x3A1: [.683, 0, .681],
    0x3A3: [.683, 0, .722],
    0x3A4: [.677, 0, .722],
    0x3A5: [.705, 0, .778],
    0x3A6: [.683, 0, .722],
    0x3A7: [.683, 0, .75],
    0x3A8: [.683, 0, .778],
    0x3A9: [.704, 0, .722],
    0x2000: [0, 0, .5],
    0x2001: [0, 0, 1],
    0x2002: [0, 0, .5],
    0x2003: [0, 0, 1],
    0x2004: [0, 0, .333],
    0x2005: [0, 0, .25],
    0x2006: [0, 0, .167],
    0x2009: [0, 0, .167],
    0x200A: [0, 0, .1],
    0x200B: [0, 0, 0],
    0x200C: [0, 0, 0],
    0x2013: [.285, -0.248, .5],
    0x2014: [.285, -0.248, 1],
    0x2015: [.285, -0.248, 1],
    0x2016: [.75, .25, .5],
    0x2017: [-0.025, .062, .5],
    0x2018: [.694, -0.379, .278],
    0x2019: [.694, -0.379, .278],
    0x201C: [.694, -0.379, .5],
    0x201D: [.694, -0.379, .5],
    0x2020: [.705, .216, .444],
    0x2021: [.705, .205, .444],
    0x2022: [.444, -0.055, .5],
    0x2026: [.12, 0, 1.172],
    0x2032: [.56, -0.043, .275],
    0x2033: [.56, 0, .55],
    0x2034: [.56, 0, .825],
    0x2035: [.56, -0.043, .275],
    0x2036: [.56, 0, .55],
    0x2037: [.56, 0, .825],
    0x203E: [.59, -0.544, .5],
    0x2044: [.75, .25, .5],
    0x2057: [.56, 0, 1.1],
    0x2060: [0, 0, 0],
    0x2061: [0, 0, 0],
    0x2062: [0, 0, 0],
    0x2063: [0, 0, 0],
    0x2064: [0, 0, 0],
    0x20D7: [.714, -0.516, .5],
    0x2102: [.702, .019, .722],
    0x210B: [.717, .036, .969, {ic: .272, sk: .333}],
    0x210C: [.666, .133, .72],
    0x210D: [.683, 0, .778],
    0x210E: [.694, .011, .576, {sk: -0.0278}],
    0x210F: [.695, .013, .54, {ic: .022}],
    0x2110: [.717, .314, 1.052, {ic: .081, sk: .417}],
    0x2111: [.686, .026, .554],
    0x2112: [.717, .017, .874, {ic: .161, sk: .306}],
    0x2113: [.705, .02, .417, {sk: .111}],
    0x2115: [.683, .02, .722],
    0x2118: [.453, .216, .636, {sk: .111}],
    0x2119: [.683, 0, .611],
    0x211A: [.701, .181, .778],
    0x211B: [.717, .017, .85, {ic: .037, sk: .194}],
    0x211C: [.686, .026, .828],
    0x211D: [.683, 0, .722],
    0x2124: [.683, 0, .667],
    0x2126: [.704, 0, .722],
    0x2127: [.684, .022, .722],
    0x2128: [.729, .139, .602],
    0x212C: [.708, .028, .908, {ic: .02, sk: .194}],
    0x212D: [.685, .024, .613],
    0x2130: [.707, .008, .562, {ic: .156, sk: .139}],
    0x2131: [.735, .036, .895, {ic: .095, sk: .222}],
    0x2132: [.695, 0, .556],
    0x2133: [.721, .05, 1.08, {ic: .136, sk: .444}],
    0x2135: [.694, 0, .611],
    0x2136: [.763, .021, .667, {ic: .02}],
    0x2137: [.764, .043, .444],
    0x2138: [.764, .043, .667],
    0x2141: [.705, .023, .639],
    0x2190: [.511, .011, 1],
    0x2191: [.694, .193, .5],
    0x2192: [.511, .011, 1],
    0x2193: [.694, .194, .5],
    0x2194: [.511, .011, 1],
    0x2195: [.772, .272, .5],
    0x2196: [.72, .195, 1],
    0x2197: [.72, .195, 1],
    0x2198: [.695, .22, 1],
    0x2199: [.695, .22, 1],
    0x219A: [.437, -0.06, 1],
    0x219B: [.437, -0.06, 1],
    0x219E: [.417, -0.083, 1],
    0x21A0: [.417, -0.083, 1],
    0x21A2: [.417, -0.083, 1.111],
    0x21A3: [.417, -0.083, 1.111],
    0x21A6: [.511, .011, 1],
    0x21A9: [.511, .011, 1.126],
    0x21AA: [.511, .011, 1.126],
    0x21AB: [.575, .041, 1],
    0x21AC: [.575, .041, 1],
    0x21AD: [.417, -0.083, 1.389],
    0x21AE: [.437, -0.06, 1],
    0x21B0: [.722, 0, .5],
    0x21B1: [.722, 0, .5],
    0x21B6: [.461, 0, 1],
    0x21B7: [.46, 0, 1],
    0x21BA: [.65, .083, .778],
    0x21BB: [.65, .083, .778],
    0x21BC: [.511, -0.23, 1],
    0x21BD: [.27, .011, 1],
    0x21BE: [.694, .194, .417],
    0x21BF: [.694, .194, .417],
    0x21C0: [.511, -0.23, 1],
    0x21C1: [.27, .011, 1],
    0x21C2: [.694, .194, .417],
    0x21C3: [.694, .194, .417],
    0x21C4: [.667, 0, 1],
    0x21C6: [.667, 0, 1],
    0x21C7: [.583, .083, 1],
    0x21C8: [.694, .193, .833],
    0x21C9: [.583, .083, 1],
    0x21CA: [.694, .194, .833],
    0x21CB: [.514, .014, 1],
    0x21CC: [.671, .011, 1],
    0x21CD: [.534, .035, 1],
    0x21CE: [.534, .037, 1],
    0x21CF: [.534, .035, 1],
    0x21D0: [.525, .024, 1],
    0x21D1: [.694, .194, .611],
    0x21D2: [.525, .024, 1],
    0x21D3: [.694, .194, .611],
    0x21D4: [.526, .025, 1],
    0x21D5: [.772, .272, .611],
    0x21DA: [.611, .111, 1],
    0x21DB: [.611, .111, 1],
    0x21DD: [.417, -0.083, 1],
    0x21E0: [.437, -0.064, 1.334],
    0x21E2: [.437, -0.064, 1.334],
    0x2200: [.694, .022, .556],
    0x2201: [.846, .021, .5],
    0x2202: [.715, .022, .531, {ic: .035, sk: .0833}],
    0x2203: [.694, 0, .556],
    0x2204: [.716, .215, .556],
    0x2205: [.772, .078, .5],
    0x2206: [.716, 0, .833],
    0x2207: [.683, .033, .833],
    0x2208: [.54, .04, .667],
    0x2209: [.716, .215, .667],
    0x220B: [.54, .04, .667],
    0x220C: [.716, .215, .667],
    0x220D: [.44, 0, .429, {ic: .027}],
    0x220F: [.75, .25, .944],
    0x2210: [.75, .25, .944],
    0x2211: [.75, .25, 1.056],
    0x2212: [.583, .082, .778],
    0x2213: [.5, .166, .778],
    0x2214: [.766, .093, .778],
    0x2215: [.75, .25, .5],
    0x2216: [.75, .25, .5],
    0x2217: [.465, -0.035, .5],
    0x2218: [.444, -0.055, .5],
    0x2219: [.444, -0.055, .5],
    0x221A: [.8, .2, .833, {ic: .02}],
    0x221D: [.442, .011, .778],
    0x221E: [.442, .011, 1],
    0x2220: [.694, 0, .722],
    0x2221: [.714, .02, .722],
    0x2222: [.551, .051, .722],
    0x2223: [.75, .249, .278],
    0x2224: [.75, .252, .278, {ic: .019}],
    0x2225: [.75, .25, .5],
    0x2226: [.75, .25, .5, {ic: .018}],
    0x2227: [.598, .022, .667],
    0x2228: [.598, .022, .667],
    0x2229: [.598, .022, .667],
    0x222A: [.598, .022, .667],
    0x222B: [.716, .216, .417, {ic: .055}],
    0x222C: [.805, .306, .819, {ic: .138}],
    0x222D: [.805, .306, 1.166, {ic: .138}],
    0x222E: [.805, .306, .472, {ic: .138}],
    0x2234: [.471, .082, .667],
    0x2235: [.471, .082, .667],
    0x223C: [.367, -0.133, .778],
    0x223D: [.367, -0.133, .778],
    0x2240: [.583, .083, .278],
    0x2241: [.467, -0.032, .778],
    0x2242: [.463, -0.034, .778],
    0x2243: [.464, -0.036, .778],
    0x2244: [.716, .215, .778],
    0x2245: [.589, -0.022, .778],
    0x2247: [.652, .155, .778],
    0x2248: [.483, -0.055, .778],
    0x2249: [.716, .215, .778],
    0x224A: [.579, .039, .778],
    0x224D: [.484, -0.016, .778],
    0x224E: [.492, -0.008, .778],
    0x224F: [.492, -0.133, .778],
    0x2250: [.67, -0.133, .778],
    0x2251: [.609, .108, .778],
    0x2252: [.601, .101, .778],
    0x2253: [.601, .102, .778],
    0x2256: [.367, -0.133, .778],
    0x2257: [.721, -0.133, .778],
    0x225C: [.859, -0.133, .778],
    0x2260: [.716, .215, .778],
    0x2261: [.464, -0.036, .778],
    0x2262: [.716, .215, .778],
    0x2264: [.636, .138, .778],
    0x2265: [.636, .138, .778],
    0x2266: [.753, .175, .778],
    0x2267: [.753, .175, .778],
    0x2268: [.752, .286, .778],
    0x2269: [.752, .286, .778],
    0x226A: [.568, .067, 1],
    0x226B: [.567, .067, 1],
    0x226C: [.75, .25, .5],
    0x226D: [.716, .215, .778],
    0x226E: [.708, .209, .778],
    0x226F: [.708, .209, .778],
    0x2270: [.801, .303, .778],
    0x2271: [.801, .303, .778],
    0x2272: [.732, .228, .778],
    0x2273: [.732, .228, .778],
    0x2274: [.732, .228, .778],
    0x2275: [.732, .228, .778],
    0x2276: [.681, .253, .778],
    0x2277: [.681, .253, .778],
    0x2278: [.716, .253, .778],
    0x2279: [.716, .253, .778],
    0x227A: [.539, .041, .778],
    0x227B: [.539, .041, .778],
    0x227C: [.58, .153, .778],
    0x227D: [.58, .154, .778],
    0x227E: [.732, .228, .778],
    0x227F: [.732, .228, .778],
    0x2280: [.705, .208, .778],
    0x2281: [.705, .208, .778],
    0x2282: [.54, .04, .778],
    0x2283: [.54, .04, .778],
    0x2284: [.716, .215, .778],
    0x2285: [.716, .215, .778],
    0x2286: [.636, .138, .778],
    0x2287: [.636, .138, .778],
    0x2288: [.801, .303, .778],
    0x2289: [.801, .303, .778],
    0x228A: [.635, .241, .778],
    0x228B: [.635, .241, .778],
    0x228E: [.598, .022, .667],
    0x228F: [.539, .041, .778],
    0x2290: [.539, .041, .778],
    0x2291: [.636, .138, .778],
    0x2292: [.636, .138, .778],
    0x2293: [.598, 0, .667],
    0x2294: [.598, 0, .667],
    0x2295: [.583, .083, .778],
    0x2296: [.583, .083, .778],
    0x2297: [.583, .083, .778],
    0x2298: [.583, .083, .778],
    0x2299: [.583, .083, .778],
    0x229A: [.582, .082, .778],
    0x229B: [.582, .082, .778],
    0x229D: [.582, .082, .778],
    0x229E: [.689, 0, .778],
    0x229F: [.689, 0, .778],
    0x22A0: [.689, 0, .778],
    0x22A1: [.689, 0, .778],
    0x22A2: [.694, 0, .611],
    0x22A3: [.694, 0, .611],
    0x22A4: [.668, 0, .778],
    0x22A5: [.668, 0, .778],
    0x22A8: [.75, .249, .867],
    0x22A9: [.694, 0, .722],
    0x22AA: [.694, 0, .889],
    0x22AC: [.695, 0, .611],
    0x22AD: [.695, 0, .611],
    0x22AE: [.695, 0, .722],
    0x22AF: [.695, 0, .722],
    0x22B2: [.539, .041, .778],
    0x22B3: [.539, .041, .778],
    0x22B4: [.636, .138, .778],
    0x22B5: [.636, .138, .778],
    0x22B8: [.408, -0.092, 1.111],
    0x22BA: [.431, .212, .556],
    0x22BB: [.716, 0, .611],
    0x22BC: [.716, 0, .611],
    0x22C0: [.75, .249, .833],
    0x22C1: [.75, .249, .833],
    0x22C2: [.75, .249, .833],
    0x22C3: [.75, .249, .833],
    0x22C4: [.488, -0.012, .5],
    0x22C5: [.31, -0.19, .278],
    0x22C6: [.486, -0.016, .5],
    0x22C7: [.545, .044, .778],
    0x22C8: [.505, .005, .9],
    0x22C9: [.492, -0.008, .778],
    0x22CA: [.492, -0.008, .778],
    0x22CB: [.694, .022, .778],
    0x22CC: [.694, .022, .778],
    0x22CD: [.464, -0.036, .778],
    0x22CE: [.578, .021, .76],
    0x22CF: [.578, .022, .76],
    0x22D0: [.54, .04, .778],
    0x22D1: [.54, .04, .778],
    0x22D2: [.598, .022, .667],
    0x22D3: [.598, .022, .667],
    0x22D4: [.736, .022, .667],
    0x22D6: [.541, .041, .778],
    0x22D7: [.541, .041, .778],
    0x22D8: [.568, .067, 1.333],
    0x22D9: [.568, .067, 1.333],
    0x22DA: [.886, .386, .778],
    0x22DB: [.886, .386, .778],
    0x22DE: [.734, 0, .778],
    0x22DF: [.734, 0, .778],
    0x22E0: [.801, .303, .778],
    0x22E1: [.801, .303, .778],
    0x22E2: [.716, .215, .778],
    0x22E3: [.716, .215, .778],
    0x22E6: [.73, .359, .778],
    0x22E7: [.73, .359, .778],
    0x22E8: [.73, .359, .778],
    0x22E9: [.73, .359, .778],
    0x22EA: [.706, .208, .778],
    0x22EB: [.706, .208, .778],
    0x22EC: [.802, .303, .778],
    0x22ED: [.801, .303, .778],
    0x22EE: [1.3, .03, .278],
    0x22EF: [.31, -0.19, 1.172],
    0x22F1: [1.52, -0.1, 1.282],
    0x2305: [.716, 0, .611],
    0x2306: [.813, .097, .611],
    0x2308: [.75, .25, .444],
    0x2309: [.75, .25, .444],
    0x230A: [.75, .25, .444],
    0x230B: [.75, .25, .444],
    0x231C: [.694, -0.306, .5],
    0x231D: [.694, -0.306, .5],
    0x231E: [.366, .022, .5],
    0x231F: [.366, .022, .5],
    0x2322: [.388, -0.122, 1],
    0x2323: [.378, -0.134, 1],
    0x2329: [.75, .25, .389],
    0x232A: [.75, .25, .389],
    0x23B0: [.744, .244, .412],
    0x23B1: [.744, .244, .412],
    0x23D0: [.602, 0, .667],
    0x24C8: [.709, .175, .902],
    0x250C: [.694, -0.306, .5],
    0x2510: [.694, -0.306, .5],
    0x2514: [.366, .022, .5],
    0x2518: [.366, .022, .5],
    0x2571: [.694, .195, .889],
    0x2572: [.694, .195, .889],
    0x25A0: [.689, 0, .778],
    0x25A1: [.689, 0, .778],
    0x25AA: [.689, 0, .778],
    0x25B2: [.575, .02, .722],
    0x25B3: [.716, 0, .889],
    0x25B4: [.575, .02, .722],
    0x25B5: [.716, 0, .889],
    0x25B6: [.539, .041, .778],
    0x25B8: [.539, .041, .778],
    0x25B9: [.505, .005, .5],
    0x25BC: [.576, .019, .722],
    0x25BD: [.5, .215, .889],
    0x25BE: [.576, .019, .722],
    0x25BF: [.5, .215, .889],
    0x25C0: [.539, .041, .778],
    0x25C2: [.539, .041, .778],
    0x25C3: [.505, .005, .5],
    0x25CA: [.716, .132, .667],
    0x25EF: [.715, .215, 1],
    0x25FB: [.689, 0, .778],
    0x25FC: [.689, 0, .778],
    0x2605: [.694, .111, .944],
    0x2660: [.727, .13, .778],
    0x2661: [.716, .033, .778],
    0x2662: [.727, .162, .778],
    0x2663: [.726, .13, .778],
    0x266D: [.75, .022, .389],
    0x266E: [.734, .223, .389],
    0x266F: [.723, .223, .389],
    0x2713: [.706, .034, .833],
    0x2720: [.716, .022, .833],
    0x2758: [.75, .249, .278],
    0x27E8: [.75, .25, .389],
    0x27E9: [.75, .25, .389],
    0x27EE: [.744, .244, .412],
    0x27EF: [.744, .244, .412],
    0x27F5: [.511, .011, 1.609],
    0x27F6: [.511, .011, 1.638],
    0x27F7: [.511, .011, 1.859],
    0x27F8: [.525, .024, 1.609],
    0x27F9: [.525, .024, 1.638],
    0x27FA: [.525, .024, 1.858],
    0x27FC: [.511, .011, 1.638],
    0x29EB: [.716, .132, .667],
    0x29F8: [.716, .215, .778],
    0x2A00: [.75, .25, 1.111],
    0x2A01: [.75, .25, 1.111],
    0x2A02: [.75, .25, 1.111],
    0x2A04: [.75, .249, .833],
    0x2A06: [.75, .249, .833],
    0x2A0C: [.805, .306, 1.638, {ic: .138}],
    0x2A2F: [.491, -0.009, .778],
    0x2A3F: [.683, 0, .75],
    0x2A5E: [.813, .097, .611],
    0x2A7D: [.636, .138, .778],
    0x2A7E: [.636, .138, .778],
    0x2A85: [.762, .29, .778],
    0x2A86: [.762, .29, .778],
    0x2A87: [.635, .241, .778],
    0x2A88: [.635, .241, .778],
    0x2A89: [.761, .387, .778],
    0x2A8A: [.761, .387, .778],
    0x2A8B: [1.003, .463, .778],
    0x2A8C: [1.003, .463, .778],
    0x2A95: [.636, .138, .778],
    0x2A96: [.636, .138, .778],
    0x2AAF: [.636, .138, .778],
    0x2AB0: [.636, .138, .778],
    0x2AB5: [.752, .286, .778],
    0x2AB6: [.752, .286, .778],
    0x2AB7: [.761, .294, .778],
    0x2AB8: [.761, .294, .778],
    0x2AB9: [.761, .337, .778],
    0x2ABA: [.761, .337, .778],
    0x2AC5: [.753, .215, .778],
    0x2AC6: [.753, .215, .778],
    0x2ACB: [.783, .385, .778],
    0x2ACC: [.783, .385, .778],
    0x3008: [.75, .25, .389],
    0x3009: [.75, .25, .389],
    0xE006: [.43, .023, .222, {ic: .018}],
    0xE007: [.431, .024, .389, {ic: .018}],
    0xE008: [.605, .085, .778],
    0xE009: [.434, .006, .667, {ic: .067}],
    0xE00C: [.752, .284, .778],
    0xE00D: [.752, .284, .778],
    0xE00E: [.919, .421, .778],
    0xE00F: [.801, .303, .778],
    0xE010: [.801, .303, .778],
    0xE011: [.919, .421, .778],
    0xE016: [.828, .33, .778],
    0xE017: [.752, .332, .778],
    0xE018: [.828, .33, .778],
    0xE019: [.752, .333, .778],
    0xE01A: [.634, .255, .778],
    0xE01B: [.634, .254, .778],
    0x1D400: [.698, 0, .869],
    0x1D401: [.686, 0, .818],
    0x1D402: [.697, .011, .831],
    0x1D403: [.686, 0, .882],
    0x1D404: [.68, 0, .756],
    0x1D405: [.68, 0, .724],
    0x1D406: [.697, .01, .904],
    0x1D407: [.686, 0, .9],
    0x1D408: [.686, 0, .436],
    0x1D409: [.686, .011, .594],
    0x1D40A: [.686, 0, .901],
    0x1D40B: [.686, 0, .692],
    0x1D40C: [.686, 0, 1.092],
    0x1D40D: [.686, 0, .9],
    0x1D40E: [.696, .01, .864],
    0x1D40F: [.686, 0, .786],
    0x1D410: [.696, .193, .864],
    0x1D411: [.686, .011, .862],
    0x1D412: [.697, .011, .639],
    0x1D413: [.675, 0, .8],
    0x1D414: [.686, .011, .885],
    0x1D415: [.686, .007, .869],
    0x1D416: [.686, .007, 1.189],
    0x1D417: [.686, 0, .869],
    0x1D418: [.686, 0, .869],
    0x1D419: [.686, 0, .703],
    0x1D41A: [.453, .006, .559],
    0x1D41B: [.694, .006, .639],
    0x1D41C: [.453, .006, .511],
    0x1D41D: [.694, .006, .639],
    0x1D41E: [.452, .006, .527],
    0x1D41F: [.7, 0, .351, {ic: .101}],
    0x1D420: [.455, .201, .575],
    0x1D421: [.694, 0, .639],
    0x1D422: [.695, 0, .319],
    0x1D423: [.695, .2, .351],
    0x1D424: [.694, 0, .607],
    0x1D425: [.694, 0, .319],
    0x1D426: [.45, 0, .958],
    0x1D427: [.45, 0, .639],
    0x1D428: [.452, .005, .575],
    0x1D429: [.45, .194, .639],
    0x1D42A: [.45, .194, .607],
    0x1D42B: [.45, 0, .474],
    0x1D42C: [.453, .006, .454],
    0x1D42D: [.635, .005, .447],
    0x1D42E: [.45, .006, .639],
    0x1D42F: [.444, 0, .607],
    0x1D430: [.444, 0, .831],
    0x1D431: [.444, 0, .607],
    0x1D432: [.444, .2, .607],
    0x1D433: [.444, 0, .511],
    0x1D434: [.716, 0, .75, {sk: .139}],
    0x1D435: [.683, 0, .759, {sk: .0833}],
    0x1D436: [.705, .022, .715, {ic: .045, sk: .0833}],
    0x1D437: [.683, 0, .828, {sk: .0556}],
    0x1D438: [.68, 0, .738, {ic: .026, sk: .0833}],
    0x1D439: [.68, 0, .643, {ic: .106, sk: .0833}],
    0x1D43A: [.705, .022, .786, {sk: .0833}],
    0x1D43B: [.683, 0, .831, {ic: .057, sk: .0556}],
    0x1D43C: [.683, 0, .44, {ic: .064, sk: .111}],
    0x1D43D: [.683, .022, .555, {ic: .078, sk: .167}],
    0x1D43E: [.683, 0, .849, {ic: .04, sk: .0556}],
    0x1D43F: [.683, 0, .681, {sk: .0278}],
    0x1D440: [.683, 0, .97, {ic: .081, sk: .0833}],
    0x1D441: [.683, 0, .803, {ic: .085, sk: .0833}],
    0x1D442: [.704, .022, .763, {sk: .0833}],
    0x1D443: [.683, 0, .642, {ic: .109, sk: .0833}],
    0x1D444: [.704, .194, .791, {sk: .0833}],
    0x1D445: [.683, .021, .759, {sk: .0833}],
    0x1D446: [.705, .022, .613, {ic: .032, sk: .0833}],
    0x1D447: [.677, 0, .584, {ic: .12, sk: .0833}],
    0x1D448: [.683, .022, .683, {ic: .084, sk: .0278}],
    0x1D449: [.683, .022, .583, {ic: .186}],
    0x1D44A: [.683, .022, .944, {ic: .104}],
    0x1D44B: [.683, 0, .828, {ic: .024, sk: .0833}],
    0x1D44C: [.683, 0, .581, {ic: .182}],
    0x1D44D: [.683, 0, .683, {ic: .04, sk: .0833}],
    0x1D44E: [.441, .01, .529],
    0x1D44F: [.694, .011, .429],
    0x1D450: [.442, .011, .433, {sk: .0556}],
    0x1D451: [.694, .01, .52, {sk: .167}],
    0x1D452: [.442, .011, .466, {sk: .0556}],
    0x1D453: [.705, .205, .49, {ic: .06, sk: .167}],
    0x1D454: [.442, .205, .477, {sk: .0278}],
    0x1D456: [.661, .011, .345],
    0x1D457: [.661, .204, .412],
    0x1D458: [.694, .011, .521],
    0x1D459: [.694, .011, .298, {sk: .0833}],
    0x1D45A: [.442, .011, .878],
    0x1D45B: [.442, .011, .6],
    0x1D45C: [.441, .011, .485, {sk: .0556}],
    0x1D45D: [.442, .194, .503, {sk: .0833}],
    0x1D45E: [.442, .194, .446, {ic: .014, sk: .0833}],
    0x1D45F: [.442, .011, .451, {sk: .0556}],
    0x1D460: [.442, .01, .469, {sk: .0556}],
    0x1D461: [.626, .011, .361, {sk: .0833}],
    0x1D462: [.442, .011, .572, {sk: .0278}],
    0x1D463: [.443, .011, .485, {sk: .0278}],
    0x1D464: [.443, .011, .716, {sk: .0833}],
    0x1D465: [.442, .011, .572, {sk: .0278}],
    0x1D466: [.442, .205, .49, {sk: .0556}],
    0x1D467: [.442, .011, .465, {sk: .0556}],
    0x1D468: [.711, 0, .869, {sk: .16}],
    0x1D469: [.686, 0, .866, {sk: .0958}],
    0x1D46A: [.703, .017, .817, {ic: .038, sk: .0958}],
    0x1D46B: [.686, 0, .938, {sk: .0639}],
    0x1D46C: [.68, 0, .81, {ic: .015, sk: .0958}],
    0x1D46D: [.68, 0, .689, {ic: .12, sk: .0958}],
    0x1D46E: [.703, .016, .887, {sk: .0958}],
    0x1D46F: [.686, 0, .982, {ic: .045, sk: .0639}],
    0x1D470: [.686, 0, .511, {ic: .062, sk: .128}],
    0x1D471: [.686, .017, .631, {ic: .063, sk: .192}],
    0x1D472: [.686, 0, .971, {ic: .032, sk: .0639}],
    0x1D473: [.686, 0, .756, {sk: .0319}],
    0x1D474: [.686, 0, 1.142, {ic: .077, sk: .0958}],
    0x1D475: [.686, 0, .95, {ic: .077, sk: .0958}],
    0x1D476: [.703, .017, .837, {sk: .0958}],
    0x1D477: [.686, 0, .723, {ic: .124, sk: .0958}],
    0x1D478: [.703, .194, .869, {sk: .0958}],
    0x1D479: [.686, .017, .872, {sk: .0958}],
    0x1D47A: [.703, .017, .693, {ic: .021, sk: .0958}],
    0x1D47B: [.675, 0, .637, {ic: .135, sk: .0958}],
    0x1D47C: [.686, .016, .8, {ic: .077, sk: .0319}],
    0x1D47D: [.686, .016, .678, {ic: .208}],
    0x1D47E: [.686, .017, 1.093, {ic: .114}],
    0x1D47F: [.686, 0, .947, {sk: .0958}],
    0x1D480: [.686, 0, .675, {ic: .201}],
    0x1D481: [.686, 0, .773, {ic: .032, sk: .0958}],
    0x1D482: [.452, .008, .633],
    0x1D483: [.694, .008, .521],
    0x1D484: [.451, .008, .513, {sk: .0639}],
    0x1D485: [.694, .008, .61, {sk: .192}],
    0x1D486: [.452, .008, .554, {sk: .0639}],
    0x1D487: [.701, .201, .568, {ic: .056, sk: .192}],
    0x1D488: [.452, .202, .545, {sk: .0319}],
    0x1D489: [.694, .008, .668, {sk: -0.0319}],
    0x1D48A: [.694, .008, .405],
    0x1D48B: [.694, .202, .471],
    0x1D48C: [.694, .008, .604],
    0x1D48D: [.694, .008, .348, {sk: .0958}],
    0x1D48E: [.452, .008, 1.032],
    0x1D48F: [.452, .008, .713],
    0x1D490: [.452, .008, .585, {sk: .0639}],
    0x1D491: [.452, .194, .601, {sk: .0958}],
    0x1D492: [.452, .194, .542, {sk: .0958}],
    0x1D493: [.452, .008, .529, {sk: .0639}],
    0x1D494: [.451, .008, .531, {sk: .0639}],
    0x1D495: [.643, .007, .415, {sk: .0958}],
    0x1D496: [.452, .008, .681, {sk: .0319}],
    0x1D497: [.453, .008, .567, {sk: .0319}],
    0x1D498: [.453, .008, .831, {sk: .0958}],
    0x1D499: [.452, .008, .659, {sk: .0319}],
    0x1D49A: [.452, .202, .59, {sk: .0639}],
    0x1D49B: [.452, .008, .555, {sk: .0639}],
    0x1D49C: [.717, .008, .803, {ic: .213, sk: .389}],
    0x1D49E: [.728, .026, .666, {ic: .153, sk: .278}],
    0x1D49F: [.708, .031, .774, {ic: .081, sk: .111}],
    0x1D4A2: [.717, .037, .61, {ic: .128, sk: .25}],
    0x1D4A5: [.717, .314, 1.052, {ic: .081, sk: .417}],
    0x1D4A6: [.717, .037, .914, {ic: .29, sk: .361}],
    0x1D4A9: [.726, .036, .902, {ic: .306, sk: .389}],
    0x1D4AA: [.707, .008, .738, {ic: .067, sk: .167}],
    0x1D4AB: [.716, .037, 1.013, {ic: .018, sk: .222}],
    0x1D4AC: [.717, .017, .883, {sk: .278}],
    0x1D4AE: [.708, .036, .868, {ic: .148, sk: .333}],
    0x1D4AF: [.735, .037, .747, {ic: .249, sk: .222}],
    0x1D4B0: [.717, .017, .8, {ic: .16, sk: .25}],
    0x1D4B1: [.717, .017, .622, {ic: .228, sk: .222}],
    0x1D4B2: [.717, .017, .805, {ic: .221, sk: .25}],
    0x1D4B3: [.717, .017, .944, {ic: .187, sk: .278}],
    0x1D4B4: [.716, .017, .71, {ic: .249, sk: .194}],
    0x1D4B5: [.717, .016, .821, {ic: .211, sk: .306}],
    0x1D504: [.696, .026, .718],
    0x1D505: [.691, .027, .884],
    0x1D507: [.685, .027, .832],
    0x1D508: [.685, .024, .663],
    0x1D509: [.686, .153, .611],
    0x1D50A: [.69, .026, .785],
    0x1D50D: [.686, .139, .552],
    0x1D50E: [.68, .027, .668, {ic: .014}],
    0x1D50F: [.686, .026, .666],
    0x1D510: [.692, .027, 1.05],
    0x1D511: [.686, .025, .832],
    0x1D512: [.729, .027, .827],
    0x1D513: [.692, .218, .828],
    0x1D514: [.729, .069, .827],
    0x1D516: [.692, .027, .829],
    0x1D517: [.701, .027, .669],
    0x1D518: [.697, .027, .646, {ic: .019}],
    0x1D519: [.686, .026, .831],
    0x1D51A: [.686, .027, 1.046],
    0x1D51B: [.688, .027, .719],
    0x1D51C: [.686, .218, .833],
    0x1D51E: [.47, .035, .5],
    0x1D51F: [.685, .031, .513],
    0x1D520: [.466, .029, .389],
    0x1D521: [.609, .033, .499],
    0x1D522: [.467, .03, .401],
    0x1D523: [.681, .221, .326],
    0x1D524: [.47, .209, .504],
    0x1D525: [.688, .205, .521],
    0x1D526: [.673, .02, .279],
    0x1D527: [.672, .208, .281],
    0x1D528: [.689, .025, .389],
    0x1D529: [.685, .02, .28],
    0x1D52A: [.475, .026, .767],
    0x1D52B: [.475, .022, .527],
    0x1D52C: [.48, .028, .489],
    0x1D52D: [.541, .212, .5],
    0x1D52E: [.479, .219, .489],
    0x1D52F: [.474, .021, .389],
    0x1D530: [.478, .029, .443],
    0x1D531: [.64, .02, .333, {ic: .015}],
    0x1D532: [.474, .023, .517],
    0x1D533: [.53, .028, .512],
    0x1D534: [.532, .028, .774],
    0x1D535: [.472, .188, .389],
    0x1D536: [.528, .218, .499],
    0x1D537: [.471, .214, .391],
    0x1D538: [.701, 0, .722],
    0x1D539: [.683, 0, .667],
    0x1D53B: [.683, 0, .722],
    0x1D53C: [.683, 0, .667],
    0x1D53D: [.683, 0, .611],
    0x1D53E: [.702, .019, .778],
    0x1D540: [.683, 0, .389],
    0x1D541: [.683, .077, .5],
    0x1D542: [.683, 0, .778],
    0x1D543: [.683, 0, .667],
    0x1D544: [.683, 0, .944],
    0x1D546: [.701, .019, .778],
    0x1D54A: [.702, .012, .556],
    0x1D54B: [.683, 0, .667],
    0x1D54C: [.683, .019, .722],
    0x1D54D: [.683, .02, .722],
    0x1D54E: [.683, .019, 1],
    0x1D54F: [.683, 0, .722],
    0x1D550: [.683, 0, .722],
    0x1D56C: [.686, .031, .847],
    0x1D56D: [.684, .031, 1.044],
    0x1D56E: [.676, .032, .723],
    0x1D56F: [.683, .029, .982],
    0x1D570: [.686, .029, .783],
    0x1D571: [.684, .146, .722],
    0x1D572: [.687, .029, .927],
    0x1D573: [.683, .126, .851],
    0x1D574: [.681, .025, .655],
    0x1D575: [.68, .141, .652],
    0x1D576: [.681, .026, .789, {ic: .017}],
    0x1D577: [.683, .028, .786],
    0x1D578: [.683, .032, 1.239],
    0x1D579: [.679, .03, .983],
    0x1D57A: [.726, .03, .976],
    0x1D57B: [.688, .223, .977],
    0x1D57C: [.726, .083, .976],
    0x1D57D: [.688, .028, .978],
    0x1D57E: [.685, .031, .978],
    0x1D57F: [.686, .03, .79, {ic: .012}],
    0x1D580: [.688, .039, .851, {ic: .02}],
    0x1D581: [.685, .029, .982],
    0x1D582: [.683, .03, 1.235],
    0x1D583: [.681, .035, .849],
    0x1D584: [.688, .214, .984],
    0x1D585: [.677, .148, .711],
    0x1D586: [.472, .032, .603],
    0x1D587: [.69, .032, .59],
    0x1D588: [.473, .026, .464],
    0x1D589: [.632, .028, .589],
    0x1D58A: [.471, .027, .472],
    0x1D58B: [.687, .222, .388],
    0x1D58C: [.472, .208, .595],
    0x1D58D: [.687, .207, .615],
    0x1D58E: [.686, .025, .331],
    0x1D58F: [.682, .203, .332],
    0x1D590: [.682, .025, .464],
    0x1D591: [.681, .024, .337],
    0x1D592: [.476, .031, .921],
    0x1D593: [.473, .028, .654],
    0x1D594: [.482, .034, .609],
    0x1D595: [.557, .207, .604],
    0x1D596: [.485, .211, .596],
    0x1D597: [.472, .026, .46],
    0x1D598: [.479, .034, .523],
    0x1D599: [.648, .027, .393, {ic: .014}],
    0x1D59A: [.472, .032, .589, {ic: .014}],
    0x1D59B: [.546, .027, .604],
    0x1D59C: [.549, .032, .918],
    0x1D59D: [.471, .188, .459],
    0x1D59E: [.557, .221, .589],
    0x1D59F: [.471, .214, .461],
    0x1D5A0: [.694, 0, .667],
    0x1D5A1: [.694, 0, .667],
    0x1D5A2: [.705, .011, .639],
    0x1D5A3: [.694, 0, .722],
    0x1D5A4: [.691, 0, .597],
    0x1D5A5: [.691, 0, .569],
    0x1D5A6: [.704, .011, .667],
    0x1D5A7: [.694, 0, .708],
    0x1D5A8: [.694, 0, .278],
    0x1D5A9: [.694, .022, .472],
    0x1D5AA: [.694, 0, .694],
    0x1D5AB: [.694, 0, .542],
    0x1D5AC: [.694, 0, .875],
    0x1D5AD: [.694, 0, .708],
    0x1D5AE: [.715, .022, .736],
    0x1D5AF: [.694, 0, .639],
    0x1D5B0: [.715, .125, .736],
    0x1D5B1: [.694, 0, .646],
    0x1D5B2: [.716, .022, .556],
    0x1D5B3: [.688, 0, .681],
    0x1D5B4: [.694, .022, .688],
    0x1D5B5: [.694, 0, .667],
    0x1D5B6: [.694, 0, .944],
    0x1D5B7: [.694, 0, .667],
    0x1D5B8: [.694, 0, .667],
    0x1D5B9: [.694, 0, .611],
    0x1D5BA: [.46, .01, .481],
    0x1D5BB: [.694, .011, .517],
    0x1D5BC: [.46, .01, .444],
    0x1D5BD: [.694, .01, .517],
    0x1D5BE: [.461, .01, .444],
    0x1D5BF: [.705, 0, .306, {ic: .041}],
    0x1D5C0: [.455, .206, .5],
    0x1D5C1: [.694, 0, .517],
    0x1D5C2: [.68, 0, .239],
    0x1D5C3: [.68, .205, .267],
    0x1D5C4: [.694, 0, .489],
    0x1D5C5: [.694, 0, .239],
    0x1D5C6: [.455, 0, .794],
    0x1D5C7: [.455, 0, .517],
    0x1D5C8: [.46, .01, .5],
    0x1D5C9: [.455, .194, .517],
    0x1D5CA: [.455, .194, .517],
    0x1D5CB: [.455, 0, .342],
    0x1D5CC: [.46, .01, .383],
    0x1D5CD: [.571, .01, .361],
    0x1D5CE: [.444, .01, .517],
    0x1D5CF: [.444, 0, .461],
    0x1D5D0: [.444, 0, .683],
    0x1D5D1: [.444, 0, .461],
    0x1D5D2: [.444, .204, .461],
    0x1D5D3: [.444, 0, .435],
    0x1D5D4: [.694, 0, .733],
    0x1D5D5: [.694, 0, .733],
    0x1D5D6: [.704, .011, .703],
    0x1D5D7: [.694, 0, .794],
    0x1D5D8: [.691, 0, .642],
    0x1D5D9: [.691, 0, .611],
    0x1D5DA: [.705, .011, .733],
    0x1D5DB: [.694, 0, .794],
    0x1D5DC: [.694, 0, .331],
    0x1D5DD: [.694, .022, .519],
    0x1D5DE: [.694, 0, .764],
    0x1D5DF: [.694, 0, .581],
    0x1D5E0: [.694, 0, .978],
    0x1D5E1: [.694, 0, .794],
    0x1D5E2: [.716, .022, .794],
    0x1D5E3: [.694, 0, .703],
    0x1D5E4: [.716, .106, .794],
    0x1D5E5: [.694, 0, .703],
    0x1D5E6: [.716, .022, .611],
    0x1D5E7: [.688, 0, .733],
    0x1D5E8: [.694, .022, .764],
    0x1D5E9: [.694, 0, .733],
    0x1D5EA: [.694, 0, 1.039],
    0x1D5EB: [.694, 0, .733],
    0x1D5EC: [.694, 0, .733],
    0x1D5ED: [.694, 0, .672],
    0x1D5EE: [.475, .011, .525],
    0x1D5EF: [.694, .01, .561],
    0x1D5F0: [.475, .011, .489],
    0x1D5F1: [.694, .011, .561],
    0x1D5F2: [.474, .01, .511],
    0x1D5F3: [.705, 0, .336, {ic: .045}],
    0x1D5F4: [.469, .206, .55],
    0x1D5F5: [.694, 0, .561],
    0x1D5F6: [.695, 0, .256],
    0x1D5F7: [.695, .205, .286],
    0x1D5F8: [.694, 0, .531],
    0x1D5F9: [.694, 0, .256],
    0x1D5FA: [.469, 0, .867],
    0x1D5FB: [.468, 0, .561],
    0x1D5FC: [.474, .011, .55],
    0x1D5FD: [.469, .194, .561],
    0x1D5FE: [.469, .194, .561],
    0x1D5FF: [.469, 0, .372],
    0x1D600: [.474, .01, .422],
    0x1D601: [.589, .01, .404],
    0x1D602: [.458, .011, .561],
    0x1D603: [.458, 0, .5],
    0x1D604: [.458, 0, .744],
    0x1D605: [.458, 0, .5],
    0x1D606: [.458, .205, .5],
    0x1D607: [.458, 0, .476],
    0x1D608: [.694, 0, .667],
    0x1D609: [.694, 0, .667, {ic: .029}],
    0x1D60A: [.705, .01, .639, {ic: .08}],
    0x1D60B: [.694, 0, .722, {ic: .025}],
    0x1D60C: [.691, 0, .597, {ic: .091}],
    0x1D60D: [.691, 0, .569, {ic: .104}],
    0x1D60E: [.705, .011, .667, {ic: .063}],
    0x1D60F: [.694, 0, .708, {ic: .06}],
    0x1D610: [.694, 0, .278, {ic: .06}],
    0x1D611: [.694, .022, .472, {ic: .063}],
    0x1D612: [.694, 0, .694, {ic: .091}],
    0x1D613: [.694, 0, .542],
    0x1D614: [.694, 0, .875, {ic: .054}],
    0x1D615: [.694, 0, .708, {ic: .058}],
    0x1D616: [.716, .022, .736, {ic: .027}],
    0x1D617: [.694, 0, .639, {ic: .051}],
    0x1D618: [.716, .125, .736, {ic: .027}],
    0x1D619: [.694, 0, .646, {ic: .052}],
    0x1D61A: [.716, .022, .556, {ic: .053}],
    0x1D61B: [.688, 0, .681, {ic: .109}],
    0x1D61C: [.694, .022, .688, {ic: .059}],
    0x1D61D: [.694, 0, .667, {ic: .132}],
    0x1D61E: [.694, 0, .944, {ic: .132}],
    0x1D61F: [.694, 0, .667, {ic: .091}],
    0x1D620: [.694, 0, .667, {ic: .143}],
    0x1D621: [.694, 0, .611, {ic: .091}],
    0x1D622: [.461, .01, .481],
    0x1D623: [.694, .011, .517, {ic: .022}],
    0x1D624: [.46, .011, .444, {ic: .055}],
    0x1D625: [.694, .01, .517, {ic: .071}],
    0x1D626: [.46, .011, .444, {ic: .028}],
    0x1D627: [.705, 0, .306, {ic: .188}],
    0x1D628: [.455, .206, .5, {ic: .068}],
    0x1D629: [.694, 0, .517],
    0x1D62A: [.68, 0, .239, {ic: .076}],
    0x1D62B: [.68, .204, .267, {ic: .069}],
    0x1D62C: [.694, 0, .489, {ic: .054}],
    0x1D62D: [.694, 0, .239, {ic: .072}],
    0x1D62E: [.455, 0, .794],
    0x1D62F: [.454, 0, .517],
    0x1D630: [.461, .011, .5, {ic: .023}],
    0x1D631: [.455, .194, .517, {ic: .021}],
    0x1D632: [.455, .194, .517, {ic: .021}],
    0x1D633: [.455, 0, .342, {ic: .082}],
    0x1D634: [.461, .011, .383, {ic: .053}],
    0x1D635: [.571, .011, .361, {ic: .049}],
    0x1D636: [.444, .01, .517, {ic: .02}],
    0x1D637: [.444, 0, .461, {ic: .079}],
    0x1D638: [.444, 0, .683, {ic: .079}],
    0x1D639: [.444, 0, .461, {ic: .076}],
    0x1D63A: [.444, .205, .461, {ic: .079}],
    0x1D63B: [.444, 0, .435, {ic: .059}],
    0x1D670: [.623, 0, .525],
    0x1D671: [.611, 0, .525],
    0x1D672: [.622, .011, .525],
    0x1D673: [.611, 0, .525],
    0x1D674: [.611, 0, .525],
    0x1D675: [.611, 0, .525],
    0x1D676: [.622, .011, .525],
    0x1D677: [.611, 0, .525],
    0x1D678: [.611, 0, .525],
    0x1D679: [.611, .011, .525],
    0x1D67A: [.611, 0, .525],
    0x1D67B: [.611, 0, .525],
    0x1D67C: [.611, 0, .525],
    0x1D67D: [.611, 0, .525],
    0x1D67E: [.621, .01, .525],
    0x1D67F: [.611, 0, .525],
    0x1D680: [.621, .138, .525],
    0x1D681: [.611, .011, .525],
    0x1D682: [.622, .011, .525],
    0x1D683: [.611, 0, .525],
    0x1D684: [.611, .011, .525],
    0x1D685: [.611, .007, .525],
    0x1D686: [.611, .007, .525],
    0x1D687: [.611, 0, .525],
    0x1D688: [.611, 0, .525],
    0x1D689: [.611, 0, .525],
    0x1D68A: [.439, .006, .525],
    0x1D68B: [.611, .006, .525],
    0x1D68C: [.44, .006, .525],
    0x1D68D: [.611, .006, .525],
    0x1D68E: [.44, .006, .525],
    0x1D68F: [.617, 0, .525],
    0x1D690: [.442, .229, .525],
    0x1D691: [.611, 0, .525],
    0x1D692: [.612, 0, .525],
    0x1D693: [.612, .228, .525],
    0x1D694: [.611, 0, .525],
    0x1D695: [.611, 0, .525],
    0x1D696: [.436, 0, .525, {ic: .011}],
    0x1D697: [.436, 0, .525],
    0x1D698: [.44, .006, .525],
    0x1D699: [.437, .221, .525],
    0x1D69A: [.437, .221, .525, {ic: .02}],
    0x1D69B: [.437, 0, .525],
    0x1D69C: [.44, .006, .525],
    0x1D69D: [.554, .006, .525],
    0x1D69E: [.431, .005, .525],
    0x1D69F: [.431, 0, .525],
    0x1D6A0: [.431, 0, .525],
    0x1D6A1: [.431, 0, .525],
    0x1D6A2: [.431, .228, .525],
    0x1D6A3: [.431, 0, .525],
    0x1D6A8: [.698, 0, .869],
    0x1D6A9: [.686, 0, .818],
    0x1D6AA: [.68, 0, .692],
    0x1D6AB: [.698, 0, .958],
    0x1D6AC: [.68, 0, .756],
    0x1D6AD: [.686, 0, .703],
    0x1D6AE: [.686, 0, .9],
    0x1D6AF: [.696, .01, .894],
    0x1D6B0: [.686, 0, .436],
    0x1D6B1: [.686, 0, .901],
    0x1D6B2: [.698, 0, .806],
    0x1D6B3: [.686, 0, 1.092],
    0x1D6B4: [.686, 0, .9],
    0x1D6B5: [.675, 0, .767],
    0x1D6B6: [.696, .01, .864],
    0x1D6B7: [.68, 0, .9],
    0x1D6B8: [.686, 0, .786],
    0x1D6BA: [.686, 0, .831],
    0x1D6BB: [.675, 0, .8],
    0x1D6BC: [.697, 0, .894],
    0x1D6BD: [.686, 0, .831],
    0x1D6BE: [.686, 0, .869],
    0x1D6BF: [.686, 0, .894],
    0x1D6C0: [.696, 0, .831],
    0x1D6C1: [.686, .024, .958],
    0x1D6E2: [.716, 0, .75, {sk: .139}],
    0x1D6E3: [.683, 0, .759, {sk: .0833}],
    0x1D6E4: [.68, 0, .615, {ic: .106, sk: .0833}],
    0x1D6E5: [.716, 0, .833, {sk: .167}],
    0x1D6E6: [.68, 0, .738, {ic: .026, sk: .0833}],
    0x1D6E7: [.683, 0, .683, {ic: .04, sk: .0833}],
    0x1D6E8: [.683, 0, .831, {ic: .057, sk: .0556}],
    0x1D6E9: [.704, .022, .763, {sk: .0833}],
    0x1D6EA: [.683, 0, .44, {ic: .064, sk: .111}],
    0x1D6EB: [.683, 0, .849, {ic: .04, sk: .0556}],
    0x1D6EC: [.716, 0, .694, {sk: .167}],
    0x1D6ED: [.683, 0, .97, {ic: .081, sk: .0833}],
    0x1D6EE: [.683, 0, .803, {ic: .085, sk: .0833}],
    0x1D6EF: [.677, 0, .742, {ic: .035, sk: .0833}],
    0x1D6F0: [.704, .022, .763, {sk: .0833}],
    0x1D6F1: [.68, 0, .831, {ic: .056, sk: .0556}],
    0x1D6F2: [.683, 0, .642, {ic: .109, sk: .0833}],
    0x1D6F4: [.683, 0, .78, {ic: .026, sk: .0833}],
    0x1D6F5: [.677, 0, .584, {ic: .12, sk: .0833}],
    0x1D6F6: [.705, 0, .583, {ic: .117, sk: .0556}],
    0x1D6F7: [.683, 0, .667, {sk: .0833}],
    0x1D6F8: [.683, 0, .828, {ic: .024, sk: .0833}],
    0x1D6F9: [.683, 0, .612, {ic: .08, sk: .0556}],
    0x1D6FA: [.704, 0, .772, {ic: .014, sk: .0833}],
    0x1D6FC: [.442, .011, .64, {sk: .0278}],
    0x1D6FD: [.705, .194, .566, {sk: .0833}],
    0x1D6FE: [.441, .216, .518, {ic: .025}],
    0x1D6FF: [.717, .01, .444, {sk: .0556}],
    0x1D700: [.452, .022, .466, {sk: .0833}],
    0x1D701: [.704, .204, .438, {ic: .033, sk: .0833}],
    0x1D702: [.442, .216, .497, {sk: .0556}],
    0x1D703: [.705, .01, .469, {sk: .0833}],
    0x1D704: [.442, .01, .354, {sk: .0556}],
    0x1D705: [.442, .011, .576],
    0x1D706: [.694, .012, .583],
    0x1D707: [.442, .216, .603, {sk: .0278}],
    0x1D708: [.442, 0, .494, {ic: .036, sk: .0278}],
    0x1D709: [.704, .205, .438, {sk: .111}],
    0x1D70A: [.441, .011, .485, {sk: .0556}],
    0x1D70B: [.431, .011, .57],
    0x1D70C: [.442, .216, .517, {sk: .0833}],
    0x1D70D: [.442, .107, .363, {ic: .042, sk: .0833}],
    0x1D70E: [.431, .011, .571],
    0x1D70F: [.431, .013, .437, {ic: .08, sk: .0278}],
    0x1D710: [.443, .01, .54, {sk: .0278}],
    0x1D711: [.442, .218, .654, {sk: .0833}],
    0x1D712: [.442, .204, .626, {sk: .0556}],
    0x1D713: [.694, .205, .651, {sk: .111}],
    0x1D714: [.443, .011, .622],
    0x1D715: [.715, .022, .531, {ic: .035, sk: .0833}],
    0x1D716: [.431, .011, .406, {sk: .0556}],
    0x1D717: [.705, .011, .591, {sk: .0833}],
    0x1D718: [.434, .006, .667, {ic: .067}],
    0x1D719: [.694, .205, .596, {sk: .0833}],
    0x1D71A: [.442, .194, .517, {sk: .0833}],
    0x1D71B: [.431, .01, .828],
    0x1D71C: [.711, 0, .869, {sk: .16}],
    0x1D71D: [.686, 0, .866, {sk: .0958}],
    0x1D71E: [.68, 0, .657, {ic: .12, sk: .0958}],
    0x1D71F: [.711, 0, .958, {sk: .192}],
    0x1D720: [.68, 0, .81, {ic: .015, sk: .0958}],
    0x1D721: [.686, 0, .773, {ic: .032, sk: .0958}],
    0x1D722: [.686, 0, .982, {ic: .045, sk: .0639}],
    0x1D723: [.702, .017, .867, {sk: .0958}],
    0x1D724: [.686, 0, .511, {ic: .062, sk: .128}],
    0x1D725: [.686, 0, .971, {ic: .032, sk: .0639}],
    0x1D726: [.711, 0, .806, {sk: .192}],
    0x1D727: [.686, 0, 1.142, {ic: .077, sk: .0958}],
    0x1D728: [.686, 0, .95, {ic: .077, sk: .0958}],
    0x1D729: [.675, 0, .841, {ic: .026, sk: .0958}],
    0x1D72A: [.703, .017, .837, {sk: .0958}],
    0x1D72B: [.68, 0, .982, {ic: .044, sk: .0639}],
    0x1D72C: [.686, 0, .723, {ic: .124, sk: .0958}],
    0x1D72E: [.686, 0, .885, {ic: .017, sk: .0958}],
    0x1D72F: [.675, 0, .637, {ic: .135, sk: .0958}],
    0x1D730: [.703, 0, .671, {ic: .131, sk: .0639}],
    0x1D731: [.686, 0, .767, {sk: .0958}],
    0x1D732: [.686, 0, .947, {sk: .0958}],
    0x1D733: [.686, 0, .714, {ic: .076, sk: .0639}],
    0x1D734: [.703, 0, .879, {sk: .0958}],
    0x1D736: [.452, .008, .761, {sk: .0319}],
    0x1D737: [.701, .194, .66, {sk: .0958}],
    0x1D738: [.451, .211, .59, {ic: .027}],
    0x1D739: [.725, .008, .522, {sk: .0639}],
    0x1D73A: [.461, .017, .529, {sk: .0958}],
    0x1D73B: [.711, .202, .508, {ic: .013, sk: .0958}],
    0x1D73C: [.452, .211, .6, {sk: .0639}],
    0x1D73D: [.702, .008, .562, {sk: .0958}],
    0x1D73E: [.452, .008, .412, {sk: .0639}],
    0x1D73F: [.452, .008, .668],
    0x1D740: [.694, .013, .671],
    0x1D741: [.452, .211, .708, {sk: .0319}],
    0x1D742: [.452, 0, .577, {ic: .031, sk: .0319}],
    0x1D743: [.711, .201, .508, {sk: .128}],
    0x1D744: [.452, .008, .585, {sk: .0639}],
    0x1D745: [.444, .008, .682],
    0x1D746: [.451, .211, .612, {sk: .0958}],
    0x1D747: [.451, .105, .424, {ic: .033, sk: .0958}],
    0x1D748: [.444, .008, .686],
    0x1D749: [.444, .013, .521, {ic: .089, sk: .0319}],
    0x1D74A: [.453, .008, .631, {sk: .0319}],
    0x1D74B: [.452, .216, .747, {sk: .0958}],
    0x1D74C: [.452, .201, .718, {sk: .0639}],
    0x1D74D: [.694, .202, .758, {sk: .128}],
    0x1D74E: [.453, .008, .718],
    0x1D74F: [.71, .017, .628, {ic: .029, sk: .0958}],
    0x1D750: [.444, .007, .483, {sk: .0639}],
    0x1D751: [.701, .008, .692, {sk: .0958}],
    0x1D752: [.434, .006, .667, {ic: .067}],
    0x1D753: [.694, .202, .712, {sk: .0958}],
    0x1D754: [.451, .194, .612, {sk: .0958}],
    0x1D755: [.444, .008, .975],
    0x1D756: [.694, 0, .733],
    0x1D757: [.694, 0, .733],
    0x1D758: [.691, 0, .581],
    0x1D759: [.694, 0, .917],
    0x1D75A: [.691, 0, .642],
    0x1D75B: [.694, 0, .672],
    0x1D75C: [.694, 0, .794],
    0x1D75D: [.716, .022, .856],
    0x1D75E: [.694, 0, .331],
    0x1D75F: [.694, 0, .764],
    0x1D760: [.694, 0, .672],
    0x1D761: [.694, 0, .978],
    0x1D762: [.694, 0, .794],
    0x1D763: [.688, 0, .733],
    0x1D764: [.716, .022, .794],
    0x1D765: [.691, 0, .794],
    0x1D766: [.694, 0, .703],
    0x1D768: [.694, 0, .794],
    0x1D769: [.688, 0, .733],
    0x1D76A: [.715, 0, .856],
    0x1D76B: [.694, 0, .794],
    0x1D76C: [.694, 0, .733],
    0x1D76D: [.694, 0, .856],
    0x1D76E: [.716, 0, .794],
    0x1D7CE: [.654, .01, .575],
    0x1D7CF: [.655, 0, .575],
    0x1D7D0: [.654, 0, .575],
    0x1D7D1: [.655, .011, .575],
    0x1D7D2: [.656, 0, .575],
    0x1D7D3: [.655, .011, .575],
    0x1D7D4: [.655, .011, .575],
    0x1D7D5: [.676, .011, .575],
    0x1D7D6: [.654, .011, .575],
    0x1D7D7: [.654, .011, .575],
    0x1D7E2: [.678, .022, .5],
    0x1D7E3: [.678, 0, .5],
    0x1D7E4: [.677, 0, .5],
    0x1D7E5: [.678, .022, .5],
    0x1D7E6: [.656, 0, .5],
    0x1D7E7: [.656, .021, .5],
    0x1D7E8: [.677, .022, .5],
    0x1D7E9: [.656, .011, .5],
    0x1D7EA: [.678, .022, .5],
    0x1D7EB: [.677, .022, .5],
    0x1D7EC: [.715, .022, .55],
    0x1D7ED: [.716, 0, .55],
    0x1D7EE: [.716, 0, .55],
    0x1D7EF: [.716, .022, .55],
    0x1D7F0: [.694, 0, .55],
    0x1D7F1: [.694, .022, .55],
    0x1D7F2: [.716, .022, .55],
    0x1D7F3: [.695, .011, .55],
    0x1D7F4: [.715, .022, .55],
    0x1D7F5: [.716, .022, .55],
    0x1D7F6: [.621, .01, .525],
    0x1D7F7: [.622, 0, .525],
    0x1D7F8: [.622, 0, .525],
    0x1D7F9: [.622, .011, .525],
    0x1D7FA: [.624, 0, .525],
    0x1D7FB: [.611, .01, .525],
    0x1D7FC: [.622, .011, .525],
    0x1D7FD: [.627, .01, .525],
    0x1D7FE: [.621, .01, .525],
    0x1D7FF: [.622, .011, .525],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const normal$1 = AddCSS(normal, {
    0xA3: {f: 'MI'},
    0xA5: {f: 'A'},
    0xAE: {f: 'A'},
    0xB7: {c: '\\22C5'},
    0xF0: {f: 'A'},
    0x2B9: {c: '\\2032'},
    0x391: {c: 'A'},
    0x392: {c: 'B'},
    0x395: {c: 'E'},
    0x396: {c: 'Z'},
    0x397: {c: 'H'},
    0x399: {c: 'I'},
    0x39A: {c: 'K'},
    0x39C: {c: 'M'},
    0x39D: {c: 'N'},
    0x39F: {c: 'O'},
    0x3A1: {c: 'P'},
    0x3A4: {c: 'T'},
    0x3A7: {c: 'X'},
    0x2000: {c: ''},
    0x2001: {c: ''},
    0x2002: {c: ''},
    0x2003: {c: ''},
    0x2004: {c: ''},
    0x2005: {c: ''},
    0x2006: {c: ''},
    0x2009: {c: ''},
    0x200A: {c: ''},
    0x200B: {c: ''},
    0x200C: {c: ''},
    0x2015: {c: '\\2014'},
    0x2016: {c: '\\2225'},
    0x2017: {c: '_'},
    0x2022: {c: '\\2219'},
    0x2033: {c: '\\2032\\2032'},
    0x2034: {c: '\\2032\\2032\\2032'},
    0x2035: {f: 'A'},
    0x2036: {c: '\\2035\\2035', f: 'A'},
    0x2037: {c: '\\2035\\2035\\2035', f: 'A'},
    0x203E: {c: '\\2C9'},
    0x2044: {c: '/'},
    0x2057: {c: '\\2032\\2032\\2032\\2032'},
    0x2060: {c: ''},
    0x2061: {c: ''},
    0x2062: {c: ''},
    0x2063: {c: ''},
    0x2064: {c: ''},
    0x20D7: {c: '\\2192', f: 'V'},
    0x2102: {c: 'C', f: 'A'},
    0x210B: {c: 'H', f: 'SC'},
    0x210C: {c: 'H', f: 'FR'},
    0x210D: {c: 'H', f: 'A'},
    0x210E: {c: 'h', f: 'I'},
    0x210F: {f: 'A'},
    0x2110: {c: 'J', f: 'SC'},
    0x2111: {c: 'I', f: 'FR'},
    0x2112: {c: 'L', f: 'SC'},
    0x2115: {c: 'N', f: 'A'},
    0x2119: {c: 'P', f: 'A'},
    0x211A: {c: 'Q', f: 'A'},
    0x211B: {c: 'R', f: 'SC'},
    0x211C: {c: 'R', f: 'FR'},
    0x211D: {c: 'R', f: 'A'},
    0x2124: {c: 'Z', f: 'A'},
    0x2126: {c: '\\3A9'},
    0x2127: {f: 'A'},
    0x2128: {c: 'Z', f: 'FR'},
    0x212C: {c: 'B', f: 'SC'},
    0x212D: {c: 'C', f: 'FR'},
    0x2130: {c: 'E', f: 'SC'},
    0x2131: {c: 'F', f: 'SC'},
    0x2132: {f: 'A'},
    0x2133: {c: 'M', f: 'SC'},
    0x2136: {f: 'A'},
    0x2137: {f: 'A'},
    0x2138: {f: 'A'},
    0x2141: {f: 'A'},
    0x219A: {f: 'A'},
    0x219B: {f: 'A'},
    0x219E: {f: 'A'},
    0x21A0: {f: 'A'},
    0x21A2: {f: 'A'},
    0x21A3: {f: 'A'},
    0x21AB: {f: 'A'},
    0x21AC: {f: 'A'},
    0x21AD: {f: 'A'},
    0x21AE: {f: 'A'},
    0x21B0: {f: 'A'},
    0x21B1: {f: 'A'},
    0x21B6: {f: 'A'},
    0x21B7: {f: 'A'},
    0x21BA: {f: 'A'},
    0x21BB: {f: 'A'},
    0x21BE: {f: 'A'},
    0x21BF: {f: 'A'},
    0x21C2: {f: 'A'},
    0x21C3: {f: 'A'},
    0x21C4: {f: 'A'},
    0x21C6: {f: 'A'},
    0x21C7: {f: 'A'},
    0x21C8: {f: 'A'},
    0x21C9: {f: 'A'},
    0x21CA: {f: 'A'},
    0x21CB: {f: 'A'},
    0x21CD: {f: 'A'},
    0x21CE: {f: 'A'},
    0x21CF: {f: 'A'},
    0x21DA: {f: 'A'},
    0x21DB: {f: 'A'},
    0x21DD: {f: 'A'},
    0x21E0: {f: 'A'},
    0x21E2: {f: 'A'},
    0x2201: {f: 'A'},
    0x2204: {c: '\\2203\\338'},
    0x2206: {c: '\\394'},
    0x220C: {c: '\\220B\\338'},
    0x220D: {f: 'A'},
    0x220F: {f: 'S1'},
    0x2210: {f: 'S1'},
    0x2211: {f: 'S1'},
    0x2214: {f: 'A'},
    0x2221: {f: 'A'},
    0x2222: {f: 'A'},
    0x2224: {f: 'A'},
    0x2226: {f: 'A'},
    0x222C: {f: 'S1'},
    0x222D: {f: 'S1'},
    0x222E: {f: 'S1'},
    0x2234: {f: 'A'},
    0x2235: {f: 'A'},
    0x223D: {f: 'A'},
    0x2241: {f: 'A'},
    0x2242: {f: 'A'},
    0x2244: {c: '\\2243\\338'},
    0x2247: {c: '\\2246', f: 'A'},
    0x2249: {c: '\\2248\\338'},
    0x224A: {f: 'A'},
    0x224E: {f: 'A'},
    0x224F: {f: 'A'},
    0x2251: {f: 'A'},
    0x2252: {f: 'A'},
    0x2253: {f: 'A'},
    0x2256: {f: 'A'},
    0x2257: {f: 'A'},
    0x225C: {f: 'A'},
    0x2262: {c: '\\2261\\338'},
    0x2266: {f: 'A'},
    0x2267: {f: 'A'},
    0x2268: {f: 'A'},
    0x2269: {f: 'A'},
    0x226C: {f: 'A'},
    0x226D: {c: '\\224D\\338'},
    0x226E: {f: 'A'},
    0x226F: {f: 'A'},
    0x2270: {f: 'A'},
    0x2271: {f: 'A'},
    0x2272: {f: 'A'},
    0x2273: {f: 'A'},
    0x2274: {c: '\\2272\\338'},
    0x2275: {c: '\\2273\\338'},
    0x2276: {f: 'A'},
    0x2277: {f: 'A'},
    0x2278: {c: '\\2276\\338'},
    0x2279: {c: '\\2277\\338'},
    0x227C: {f: 'A'},
    0x227D: {f: 'A'},
    0x227E: {f: 'A'},
    0x227F: {f: 'A'},
    0x2280: {f: 'A'},
    0x2281: {f: 'A'},
    0x2284: {c: '\\2282\\338'},
    0x2285: {c: '\\2283\\338'},
    0x2288: {f: 'A'},
    0x2289: {f: 'A'},
    0x228A: {f: 'A'},
    0x228B: {f: 'A'},
    0x228F: {f: 'A'},
    0x2290: {f: 'A'},
    0x229A: {f: 'A'},
    0x229B: {f: 'A'},
    0x229D: {f: 'A'},
    0x229E: {f: 'A'},
    0x229F: {f: 'A'},
    0x22A0: {f: 'A'},
    0x22A1: {f: 'A'},
    0x22A9: {f: 'A'},
    0x22AA: {f: 'A'},
    0x22AC: {f: 'A'},
    0x22AD: {f: 'A'},
    0x22AE: {f: 'A'},
    0x22AF: {f: 'A'},
    0x22B2: {f: 'A'},
    0x22B3: {f: 'A'},
    0x22B4: {f: 'A'},
    0x22B5: {f: 'A'},
    0x22B8: {f: 'A'},
    0x22BA: {f: 'A'},
    0x22BB: {f: 'A'},
    0x22BC: {f: 'A'},
    0x22C0: {f: 'S1'},
    0x22C1: {f: 'S1'},
    0x22C2: {f: 'S1'},
    0x22C3: {f: 'S1'},
    0x22C7: {f: 'A'},
    0x22C9: {f: 'A'},
    0x22CA: {f: 'A'},
    0x22CB: {f: 'A'},
    0x22CC: {f: 'A'},
    0x22CD: {f: 'A'},
    0x22CE: {f: 'A'},
    0x22CF: {f: 'A'},
    0x22D0: {f: 'A'},
    0x22D1: {f: 'A'},
    0x22D2: {f: 'A'},
    0x22D3: {f: 'A'},
    0x22D4: {f: 'A'},
    0x22D6: {f: 'A'},
    0x22D7: {f: 'A'},
    0x22D8: {f: 'A'},
    0x22D9: {f: 'A'},
    0x22DA: {f: 'A'},
    0x22DB: {f: 'A'},
    0x22DE: {f: 'A'},
    0x22DF: {f: 'A'},
    0x22E0: {f: 'A'},
    0x22E1: {f: 'A'},
    0x22E2: {c: '\\2291\\338'},
    0x22E3: {c: '\\2292\\338'},
    0x22E6: {f: 'A'},
    0x22E7: {f: 'A'},
    0x22E8: {f: 'A'},
    0x22E9: {f: 'A'},
    0x22EA: {f: 'A'},
    0x22EB: {f: 'A'},
    0x22EC: {f: 'A'},
    0x22ED: {f: 'A'},
    0x2305: {c: '\\22BC', f: 'A'},
    0x2306: {c: '\\2A5E', f: 'A'},
    0x231C: {c: '\\250C', f: 'A'},
    0x231D: {c: '\\2510', f: 'A'},
    0x231E: {c: '\\2514', f: 'A'},
    0x231F: {c: '\\2518', f: 'A'},
    0x2329: {c: '\\27E8'},
    0x232A: {c: '\\27E9'},
    0x23D0: {f: 'S1'},
    0x24C8: {f: 'A'},
    0x250C: {f: 'A'},
    0x2510: {f: 'A'},
    0x2514: {f: 'A'},
    0x2518: {f: 'A'},
    0x2571: {f: 'A'},
    0x2572: {f: 'A'},
    0x25A0: {f: 'A'},
    0x25A1: {f: 'A'},
    0x25AA: {c: '\\25A0', f: 'A'},
    0x25B2: {f: 'A'},
    0x25B4: {c: '\\25B2', f: 'A'},
    0x25B5: {c: '\\25B3'},
    0x25B6: {f: 'A'},
    0x25B8: {c: '\\25B6', f: 'A'},
    0x25BC: {f: 'A'},
    0x25BE: {c: '\\25BC', f: 'A'},
    0x25BF: {c: '\\25BD'},
    0x25C0: {f: 'A'},
    0x25C2: {c: '\\25C0', f: 'A'},
    0x25CA: {f: 'A'},
    0x25FB: {c: '\\25A1', f: 'A'},
    0x25FC: {c: '\\25A0', f: 'A'},
    0x2605: {f: 'A'},
    0x2713: {f: 'A'},
    0x2720: {f: 'A'},
    0x2758: {c: '\\2223'},
    0x29EB: {f: 'A'},
    0x29F8: {c: '/', f: 'I'},
    0x2A00: {f: 'S1'},
    0x2A01: {f: 'S1'},
    0x2A02: {f: 'S1'},
    0x2A04: {f: 'S1'},
    0x2A06: {f: 'S1'},
    0x2A0C: {c: '\\222C\\222C', f: 'S1'},
    0x2A2F: {c: '\\D7'},
    0x2A5E: {f: 'A'},
    0x2A7D: {f: 'A'},
    0x2A7E: {f: 'A'},
    0x2A85: {f: 'A'},
    0x2A86: {f: 'A'},
    0x2A87: {f: 'A'},
    0x2A88: {f: 'A'},
    0x2A89: {f: 'A'},
    0x2A8A: {f: 'A'},
    0x2A8B: {f: 'A'},
    0x2A8C: {f: 'A'},
    0x2A95: {f: 'A'},
    0x2A96: {f: 'A'},
    0x2AB5: {f: 'A'},
    0x2AB6: {f: 'A'},
    0x2AB7: {f: 'A'},
    0x2AB8: {f: 'A'},
    0x2AB9: {f: 'A'},
    0x2ABA: {f: 'A'},
    0x2AC5: {f: 'A'},
    0x2AC6: {f: 'A'},
    0x2ACB: {f: 'A'},
    0x2ACC: {f: 'A'},
    0x3008: {c: '\\27E8'},
    0x3009: {c: '\\27E9'},
    0xE006: {f: 'A'},
    0xE007: {f: 'A'},
    0xE008: {f: 'A'},
    0xE009: {f: 'A'},
    0xE00C: {f: 'A'},
    0xE00D: {f: 'A'},
    0xE00E: {f: 'A'},
    0xE00F: {f: 'A'},
    0xE010: {f: 'A'},
    0xE011: {f: 'A'},
    0xE016: {f: 'A'},
    0xE017: {f: 'A'},
    0xE018: {f: 'A'},
    0xE019: {f: 'A'},
    0xE01A: {f: 'A'},
    0xE01B: {f: 'A'},
    0x1D400: {c: 'A', f: 'B'},
    0x1D401: {c: 'B', f: 'B'},
    0x1D402: {c: 'C', f: 'B'},
    0x1D403: {c: 'D', f: 'B'},
    0x1D404: {c: 'E', f: 'B'},
    0x1D405: {c: 'F', f: 'B'},
    0x1D406: {c: 'G', f: 'B'},
    0x1D407: {c: 'H', f: 'B'},
    0x1D408: {c: 'I', f: 'B'},
    0x1D409: {c: 'J', f: 'B'},
    0x1D40A: {c: 'K', f: 'B'},
    0x1D40B: {c: 'L', f: 'B'},
    0x1D40C: {c: 'M', f: 'B'},
    0x1D40D: {c: 'N', f: 'B'},
    0x1D40E: {c: 'O', f: 'B'},
    0x1D40F: {c: 'P', f: 'B'},
    0x1D410: {c: 'Q', f: 'B'},
    0x1D411: {c: 'R', f: 'B'},
    0x1D412: {c: 'S', f: 'B'},
    0x1D413: {c: 'T', f: 'B'},
    0x1D414: {c: 'U', f: 'B'},
    0x1D415: {c: 'V', f: 'B'},
    0x1D416: {c: 'W', f: 'B'},
    0x1D417: {c: 'X', f: 'B'},
    0x1D418: {c: 'Y', f: 'B'},
    0x1D419: {c: 'Z', f: 'B'},
    0x1D41A: {c: 'a', f: 'B'},
    0x1D41B: {c: 'b', f: 'B'},
    0x1D41C: {c: 'c', f: 'B'},
    0x1D41D: {c: 'd', f: 'B'},
    0x1D41E: {c: 'e', f: 'B'},
    0x1D41F: {c: 'f', f: 'B'},
    0x1D420: {c: 'g', f: 'B'},
    0x1D421: {c: 'h', f: 'B'},
    0x1D422: {c: 'i', f: 'B'},
    0x1D423: {c: 'j', f: 'B'},
    0x1D424: {c: 'k', f: 'B'},
    0x1D425: {c: 'l', f: 'B'},
    0x1D426: {c: 'm', f: 'B'},
    0x1D427: {c: 'n', f: 'B'},
    0x1D428: {c: 'o', f: 'B'},
    0x1D429: {c: 'p', f: 'B'},
    0x1D42A: {c: 'q', f: 'B'},
    0x1D42B: {c: 'r', f: 'B'},
    0x1D42C: {c: 's', f: 'B'},
    0x1D42D: {c: 't', f: 'B'},
    0x1D42E: {c: 'u', f: 'B'},
    0x1D42F: {c: 'v', f: 'B'},
    0x1D430: {c: 'w', f: 'B'},
    0x1D431: {c: 'x', f: 'B'},
    0x1D432: {c: 'y', f: 'B'},
    0x1D433: {c: 'z', f: 'B'},
    0x1D434: {c: 'A', f: 'I'},
    0x1D435: {c: 'B', f: 'I'},
    0x1D436: {c: 'C', f: 'I'},
    0x1D437: {c: 'D', f: 'I'},
    0x1D438: {c: 'E', f: 'I'},
    0x1D439: {c: 'F', f: 'I'},
    0x1D43A: {c: 'G', f: 'I'},
    0x1D43B: {c: 'H', f: 'I'},
    0x1D43C: {c: 'I', f: 'I'},
    0x1D43D: {c: 'J', f: 'I'},
    0x1D43E: {c: 'K', f: 'I'},
    0x1D43F: {c: 'L', f: 'I'},
    0x1D440: {c: 'M', f: 'I'},
    0x1D441: {c: 'N', f: 'I'},
    0x1D442: {c: 'O', f: 'I'},
    0x1D443: {c: 'P', f: 'I'},
    0x1D444: {c: 'Q', f: 'I'},
    0x1D445: {c: 'R', f: 'I'},
    0x1D446: {c: 'S', f: 'I'},
    0x1D447: {c: 'T', f: 'I'},
    0x1D448: {c: 'U', f: 'I'},
    0x1D449: {c: 'V', f: 'I'},
    0x1D44A: {c: 'W', f: 'I'},
    0x1D44B: {c: 'X', f: 'I'},
    0x1D44C: {c: 'Y', f: 'I'},
    0x1D44D: {c: 'Z', f: 'I'},
    0x1D44E: {c: 'a', f: 'I'},
    0x1D44F: {c: 'b', f: 'I'},
    0x1D450: {c: 'c', f: 'I'},
    0x1D451: {c: 'd', f: 'I'},
    0x1D452: {c: 'e', f: 'I'},
    0x1D453: {c: 'f', f: 'I'},
    0x1D454: {c: 'g', f: 'I'},
    0x1D456: {c: 'i', f: 'I'},
    0x1D457: {c: 'j', f: 'I'},
    0x1D458: {c: 'k', f: 'I'},
    0x1D459: {c: 'l', f: 'I'},
    0x1D45A: {c: 'm', f: 'I'},
    0x1D45B: {c: 'n', f: 'I'},
    0x1D45C: {c: 'o', f: 'I'},
    0x1D45D: {c: 'p', f: 'I'},
    0x1D45E: {c: 'q', f: 'I'},
    0x1D45F: {c: 'r', f: 'I'},
    0x1D460: {c: 's', f: 'I'},
    0x1D461: {c: 't', f: 'I'},
    0x1D462: {c: 'u', f: 'I'},
    0x1D463: {c: 'v', f: 'I'},
    0x1D464: {c: 'w', f: 'I'},
    0x1D465: {c: 'x', f: 'I'},
    0x1D466: {c: 'y', f: 'I'},
    0x1D467: {c: 'z', f: 'I'},
    0x1D468: {c: 'A', f: 'BI'},
    0x1D469: {c: 'B', f: 'BI'},
    0x1D46A: {c: 'C', f: 'BI'},
    0x1D46B: {c: 'D', f: 'BI'},
    0x1D46C: {c: 'E', f: 'BI'},
    0x1D46D: {c: 'F', f: 'BI'},
    0x1D46E: {c: 'G', f: 'BI'},
    0x1D46F: {c: 'H', f: 'BI'},
    0x1D470: {c: 'I', f: 'BI'},
    0x1D471: {c: 'J', f: 'BI'},
    0x1D472: {c: 'K', f: 'BI'},
    0x1D473: {c: 'L', f: 'BI'},
    0x1D474: {c: 'M', f: 'BI'},
    0x1D475: {c: 'N', f: 'BI'},
    0x1D476: {c: 'O', f: 'BI'},
    0x1D477: {c: 'P', f: 'BI'},
    0x1D478: {c: 'Q', f: 'BI'},
    0x1D479: {c: 'R', f: 'BI'},
    0x1D47A: {c: 'S', f: 'BI'},
    0x1D47B: {c: 'T', f: 'BI'},
    0x1D47C: {c: 'U', f: 'BI'},
    0x1D47D: {c: 'V', f: 'BI'},
    0x1D47E: {c: 'W', f: 'BI'},
    0x1D47F: {c: 'X', f: 'BI'},
    0x1D480: {c: 'Y', f: 'BI'},
    0x1D481: {c: 'Z', f: 'BI'},
    0x1D482: {c: 'a', f: 'BI'},
    0x1D483: {c: 'b', f: 'BI'},
    0x1D484: {c: 'c', f: 'BI'},
    0x1D485: {c: 'd', f: 'BI'},
    0x1D486: {c: 'e', f: 'BI'},
    0x1D487: {c: 'f', f: 'BI'},
    0x1D488: {c: 'g', f: 'BI'},
    0x1D489: {c: 'h', f: 'BI'},
    0x1D48A: {c: 'i', f: 'BI'},
    0x1D48B: {c: 'j', f: 'BI'},
    0x1D48C: {c: 'k', f: 'BI'},
    0x1D48D: {c: 'l', f: 'BI'},
    0x1D48E: {c: 'm', f: 'BI'},
    0x1D48F: {c: 'n', f: 'BI'},
    0x1D490: {c: 'o', f: 'BI'},
    0x1D491: {c: 'p', f: 'BI'},
    0x1D492: {c: 'q', f: 'BI'},
    0x1D493: {c: 'r', f: 'BI'},
    0x1D494: {c: 's', f: 'BI'},
    0x1D495: {c: 't', f: 'BI'},
    0x1D496: {c: 'u', f: 'BI'},
    0x1D497: {c: 'v', f: 'BI'},
    0x1D498: {c: 'w', f: 'BI'},
    0x1D499: {c: 'x', f: 'BI'},
    0x1D49A: {c: 'y', f: 'BI'},
    0x1D49B: {c: 'z', f: 'BI'},
    0x1D49C: {c: 'A', f: 'SC'},
    0x1D49E: {c: 'C', f: 'SC'},
    0x1D49F: {c: 'D', f: 'SC'},
    0x1D4A2: {c: 'G', f: 'SC'},
    0x1D4A5: {c: 'J', f: 'SC'},
    0x1D4A6: {c: 'K', f: 'SC'},
    0x1D4A9: {c: 'N', f: 'SC'},
    0x1D4AA: {c: 'O', f: 'SC'},
    0x1D4AB: {c: 'P', f: 'SC'},
    0x1D4AC: {c: 'Q', f: 'SC'},
    0x1D4AE: {c: 'S', f: 'SC'},
    0x1D4AF: {c: 'T', f: 'SC'},
    0x1D4B0: {c: 'U', f: 'SC'},
    0x1D4B1: {c: 'V', f: 'SC'},
    0x1D4B2: {c: 'W', f: 'SC'},
    0x1D4B3: {c: 'X', f: 'SC'},
    0x1D4B4: {c: 'Y', f: 'SC'},
    0x1D4B5: {c: 'Z', f: 'SC'},
    0x1D504: {c: 'A', f: 'FR'},
    0x1D505: {c: 'B', f: 'FR'},
    0x1D507: {c: 'D', f: 'FR'},
    0x1D508: {c: 'E', f: 'FR'},
    0x1D509: {c: 'F', f: 'FR'},
    0x1D50A: {c: 'G', f: 'FR'},
    0x1D50D: {c: 'J', f: 'FR'},
    0x1D50E: {c: 'K', f: 'FR'},
    0x1D50F: {c: 'L', f: 'FR'},
    0x1D510: {c: 'M', f: 'FR'},
    0x1D511: {c: 'N', f: 'FR'},
    0x1D512: {c: 'O', f: 'FR'},
    0x1D513: {c: 'P', f: 'FR'},
    0x1D514: {c: 'Q', f: 'FR'},
    0x1D516: {c: 'S', f: 'FR'},
    0x1D517: {c: 'T', f: 'FR'},
    0x1D518: {c: 'U', f: 'FR'},
    0x1D519: {c: 'V', f: 'FR'},
    0x1D51A: {c: 'W', f: 'FR'},
    0x1D51B: {c: 'X', f: 'FR'},
    0x1D51C: {c: 'Y', f: 'FR'},
    0x1D51E: {c: 'a', f: 'FR'},
    0x1D51F: {c: 'b', f: 'FR'},
    0x1D520: {c: 'c', f: 'FR'},
    0x1D521: {c: 'd', f: 'FR'},
    0x1D522: {c: 'e', f: 'FR'},
    0x1D523: {c: 'f', f: 'FR'},
    0x1D524: {c: 'g', f: 'FR'},
    0x1D525: {c: 'h', f: 'FR'},
    0x1D526: {c: 'i', f: 'FR'},
    0x1D527: {c: 'j', f: 'FR'},
    0x1D528: {c: 'k', f: 'FR'},
    0x1D529: {c: 'l', f: 'FR'},
    0x1D52A: {c: 'm', f: 'FR'},
    0x1D52B: {c: 'n', f: 'FR'},
    0x1D52C: {c: 'o', f: 'FR'},
    0x1D52D: {c: 'p', f: 'FR'},
    0x1D52E: {c: 'q', f: 'FR'},
    0x1D52F: {c: 'r', f: 'FR'},
    0x1D530: {c: 's', f: 'FR'},
    0x1D531: {c: 't', f: 'FR'},
    0x1D532: {c: 'u', f: 'FR'},
    0x1D533: {c: 'v', f: 'FR'},
    0x1D534: {c: 'w', f: 'FR'},
    0x1D535: {c: 'x', f: 'FR'},
    0x1D536: {c: 'y', f: 'FR'},
    0x1D537: {c: 'z', f: 'FR'},
    0x1D538: {c: 'A', f: 'A'},
    0x1D539: {c: 'B', f: 'A'},
    0x1D53B: {c: 'D', f: 'A'},
    0x1D53C: {c: 'E', f: 'A'},
    0x1D53D: {c: 'F', f: 'A'},
    0x1D53E: {c: 'G', f: 'A'},
    0x1D540: {c: 'I', f: 'A'},
    0x1D541: {c: 'J', f: 'A'},
    0x1D542: {c: 'K', f: 'A'},
    0x1D543: {c: 'L', f: 'A'},
    0x1D544: {c: 'M', f: 'A'},
    0x1D546: {c: 'O', f: 'A'},
    0x1D54A: {c: 'S', f: 'A'},
    0x1D54B: {c: 'T', f: 'A'},
    0x1D54C: {c: 'U', f: 'A'},
    0x1D54D: {c: 'V', f: 'A'},
    0x1D54E: {c: 'W', f: 'A'},
    0x1D54F: {c: 'X', f: 'A'},
    0x1D550: {c: 'Y', f: 'A'},
    0x1D56C: {c: 'A', f: 'FRB'},
    0x1D56D: {c: 'B', f: 'FRB'},
    0x1D56E: {c: 'C', f: 'FRB'},
    0x1D56F: {c: 'D', f: 'FRB'},
    0x1D570: {c: 'E', f: 'FRB'},
    0x1D571: {c: 'F', f: 'FRB'},
    0x1D572: {c: 'G', f: 'FRB'},
    0x1D573: {c: 'H', f: 'FRB'},
    0x1D574: {c: 'I', f: 'FRB'},
    0x1D575: {c: 'J', f: 'FRB'},
    0x1D576: {c: 'K', f: 'FRB'},
    0x1D577: {c: 'L', f: 'FRB'},
    0x1D578: {c: 'M', f: 'FRB'},
    0x1D579: {c: 'N', f: 'FRB'},
    0x1D57A: {c: 'O', f: 'FRB'},
    0x1D57B: {c: 'P', f: 'FRB'},
    0x1D57C: {c: 'Q', f: 'FRB'},
    0x1D57D: {c: 'R', f: 'FRB'},
    0x1D57E: {c: 'S', f: 'FRB'},
    0x1D57F: {c: 'T', f: 'FRB'},
    0x1D580: {c: 'U', f: 'FRB'},
    0x1D581: {c: 'V', f: 'FRB'},
    0x1D582: {c: 'W', f: 'FRB'},
    0x1D583: {c: 'X', f: 'FRB'},
    0x1D584: {c: 'Y', f: 'FRB'},
    0x1D585: {c: 'Z', f: 'FRB'},
    0x1D586: {c: 'a', f: 'FRB'},
    0x1D587: {c: 'b', f: 'FRB'},
    0x1D588: {c: 'c', f: 'FRB'},
    0x1D589: {c: 'd', f: 'FRB'},
    0x1D58A: {c: 'e', f: 'FRB'},
    0x1D58B: {c: 'f', f: 'FRB'},
    0x1D58C: {c: 'g', f: 'FRB'},
    0x1D58D: {c: 'h', f: 'FRB'},
    0x1D58E: {c: 'i', f: 'FRB'},
    0x1D58F: {c: 'j', f: 'FRB'},
    0x1D590: {c: 'k', f: 'FRB'},
    0x1D591: {c: 'l', f: 'FRB'},
    0x1D592: {c: 'm', f: 'FRB'},
    0x1D593: {c: 'n', f: 'FRB'},
    0x1D594: {c: 'o', f: 'FRB'},
    0x1D595: {c: 'p', f: 'FRB'},
    0x1D596: {c: 'q', f: 'FRB'},
    0x1D597: {c: 'r', f: 'FRB'},
    0x1D598: {c: 's', f: 'FRB'},
    0x1D599: {c: 't', f: 'FRB'},
    0x1D59A: {c: 'u', f: 'FRB'},
    0x1D59B: {c: 'v', f: 'FRB'},
    0x1D59C: {c: 'w', f: 'FRB'},
    0x1D59D: {c: 'x', f: 'FRB'},
    0x1D59E: {c: 'y', f: 'FRB'},
    0x1D59F: {c: 'z', f: 'FRB'},
    0x1D5A0: {c: 'A', f: 'SS'},
    0x1D5A1: {c: 'B', f: 'SS'},
    0x1D5A2: {c: 'C', f: 'SS'},
    0x1D5A3: {c: 'D', f: 'SS'},
    0x1D5A4: {c: 'E', f: 'SS'},
    0x1D5A5: {c: 'F', f: 'SS'},
    0x1D5A6: {c: 'G', f: 'SS'},
    0x1D5A7: {c: 'H', f: 'SS'},
    0x1D5A8: {c: 'I', f: 'SS'},
    0x1D5A9: {c: 'J', f: 'SS'},
    0x1D5AA: {c: 'K', f: 'SS'},
    0x1D5AB: {c: 'L', f: 'SS'},
    0x1D5AC: {c: 'M', f: 'SS'},
    0x1D5AD: {c: 'N', f: 'SS'},
    0x1D5AE: {c: 'O', f: 'SS'},
    0x1D5AF: {c: 'P', f: 'SS'},
    0x1D5B0: {c: 'Q', f: 'SS'},
    0x1D5B1: {c: 'R', f: 'SS'},
    0x1D5B2: {c: 'S', f: 'SS'},
    0x1D5B3: {c: 'T', f: 'SS'},
    0x1D5B4: {c: 'U', f: 'SS'},
    0x1D5B5: {c: 'V', f: 'SS'},
    0x1D5B6: {c: 'W', f: 'SS'},
    0x1D5B7: {c: 'X', f: 'SS'},
    0x1D5B8: {c: 'Y', f: 'SS'},
    0x1D5B9: {c: 'Z', f: 'SS'},
    0x1D5BA: {c: 'a', f: 'SS'},
    0x1D5BB: {c: 'b', f: 'SS'},
    0x1D5BC: {c: 'c', f: 'SS'},
    0x1D5BD: {c: 'd', f: 'SS'},
    0x1D5BE: {c: 'e', f: 'SS'},
    0x1D5BF: {c: 'f', f: 'SS'},
    0x1D5C0: {c: 'g', f: 'SS'},
    0x1D5C1: {c: 'h', f: 'SS'},
    0x1D5C2: {c: 'i', f: 'SS'},
    0x1D5C3: {c: 'j', f: 'SS'},
    0x1D5C4: {c: 'k', f: 'SS'},
    0x1D5C5: {c: 'l', f: 'SS'},
    0x1D5C6: {c: 'm', f: 'SS'},
    0x1D5C7: {c: 'n', f: 'SS'},
    0x1D5C8: {c: 'o', f: 'SS'},
    0x1D5C9: {c: 'p', f: 'SS'},
    0x1D5CA: {c: 'q', f: 'SS'},
    0x1D5CB: {c: 'r', f: 'SS'},
    0x1D5CC: {c: 's', f: 'SS'},
    0x1D5CD: {c: 't', f: 'SS'},
    0x1D5CE: {c: 'u', f: 'SS'},
    0x1D5CF: {c: 'v', f: 'SS'},
    0x1D5D0: {c: 'w', f: 'SS'},
    0x1D5D1: {c: 'x', f: 'SS'},
    0x1D5D2: {c: 'y', f: 'SS'},
    0x1D5D3: {c: 'z', f: 'SS'},
    0x1D5D4: {c: 'A', f: 'SSB'},
    0x1D5D5: {c: 'B', f: 'SSB'},
    0x1D5D6: {c: 'C', f: 'SSB'},
    0x1D5D7: {c: 'D', f: 'SSB'},
    0x1D5D8: {c: 'E', f: 'SSB'},
    0x1D5D9: {c: 'F', f: 'SSB'},
    0x1D5DA: {c: 'G', f: 'SSB'},
    0x1D5DB: {c: 'H', f: 'SSB'},
    0x1D5DC: {c: 'I', f: 'SSB'},
    0x1D5DD: {c: 'J', f: 'SSB'},
    0x1D5DE: {c: 'K', f: 'SSB'},
    0x1D5DF: {c: 'L', f: 'SSB'},
    0x1D5E0: {c: 'M', f: 'SSB'},
    0x1D5E1: {c: 'N', f: 'SSB'},
    0x1D5E2: {c: 'O', f: 'SSB'},
    0x1D5E3: {c: 'P', f: 'SSB'},
    0x1D5E4: {c: 'Q', f: 'SSB'},
    0x1D5E5: {c: 'R', f: 'SSB'},
    0x1D5E6: {c: 'S', f: 'SSB'},
    0x1D5E7: {c: 'T', f: 'SSB'},
    0x1D5E8: {c: 'U', f: 'SSB'},
    0x1D5E9: {c: 'V', f: 'SSB'},
    0x1D5EA: {c: 'W', f: 'SSB'},
    0x1D5EB: {c: 'X', f: 'SSB'},
    0x1D5EC: {c: 'Y', f: 'SSB'},
    0x1D5ED: {c: 'Z', f: 'SSB'},
    0x1D5EE: {c: 'a', f: 'SSB'},
    0x1D5EF: {c: 'b', f: 'SSB'},
    0x1D5F0: {c: 'c', f: 'SSB'},
    0x1D5F1: {c: 'd', f: 'SSB'},
    0x1D5F2: {c: 'e', f: 'SSB'},
    0x1D5F3: {c: 'f', f: 'SSB'},
    0x1D5F4: {c: 'g', f: 'SSB'},
    0x1D5F5: {c: 'h', f: 'SSB'},
    0x1D5F6: {c: 'i', f: 'SSB'},
    0x1D5F7: {c: 'j', f: 'SSB'},
    0x1D5F8: {c: 'k', f: 'SSB'},
    0x1D5F9: {c: 'l', f: 'SSB'},
    0x1D5FA: {c: 'm', f: 'SSB'},
    0x1D5FB: {c: 'n', f: 'SSB'},
    0x1D5FC: {c: 'o', f: 'SSB'},
    0x1D5FD: {c: 'p', f: 'SSB'},
    0x1D5FE: {c: 'q', f: 'SSB'},
    0x1D5FF: {c: 'r', f: 'SSB'},
    0x1D600: {c: 's', f: 'SSB'},
    0x1D601: {c: 't', f: 'SSB'},
    0x1D602: {c: 'u', f: 'SSB'},
    0x1D603: {c: 'v', f: 'SSB'},
    0x1D604: {c: 'w', f: 'SSB'},
    0x1D605: {c: 'x', f: 'SSB'},
    0x1D606: {c: 'y', f: 'SSB'},
    0x1D607: {c: 'z', f: 'SSB'},
    0x1D608: {c: 'A', f: 'SSI'},
    0x1D609: {c: 'B', f: 'SSI'},
    0x1D60A: {c: 'C', f: 'SSI'},
    0x1D60B: {c: 'D', f: 'SSI'},
    0x1D60C: {c: 'E', f: 'SSI'},
    0x1D60D: {c: 'F', f: 'SSI'},
    0x1D60E: {c: 'G', f: 'SSI'},
    0x1D60F: {c: 'H', f: 'SSI'},
    0x1D610: {c: 'I', f: 'SSI'},
    0x1D611: {c: 'J', f: 'SSI'},
    0x1D612: {c: 'K', f: 'SSI'},
    0x1D613: {c: 'L', f: 'SSI'},
    0x1D614: {c: 'M', f: 'SSI'},
    0x1D615: {c: 'N', f: 'SSI'},
    0x1D616: {c: 'O', f: 'SSI'},
    0x1D617: {c: 'P', f: 'SSI'},
    0x1D618: {c: 'Q', f: 'SSI'},
    0x1D619: {c: 'R', f: 'SSI'},
    0x1D61A: {c: 'S', f: 'SSI'},
    0x1D61B: {c: 'T', f: 'SSI'},
    0x1D61C: {c: 'U', f: 'SSI'},
    0x1D61D: {c: 'V', f: 'SSI'},
    0x1D61E: {c: 'W', f: 'SSI'},
    0x1D61F: {c: 'X', f: 'SSI'},
    0x1D620: {c: 'Y', f: 'SSI'},
    0x1D621: {c: 'Z', f: 'SSI'},
    0x1D622: {c: 'a', f: 'SSI'},
    0x1D623: {c: 'b', f: 'SSI'},
    0x1D624: {c: 'c', f: 'SSI'},
    0x1D625: {c: 'd', f: 'SSI'},
    0x1D626: {c: 'e', f: 'SSI'},
    0x1D627: {c: 'f', f: 'SSI'},
    0x1D628: {c: 'g', f: 'SSI'},
    0x1D629: {c: 'h', f: 'SSI'},
    0x1D62A: {c: 'i', f: 'SSI'},
    0x1D62B: {c: 'j', f: 'SSI'},
    0x1D62C: {c: 'k', f: 'SSI'},
    0x1D62D: {c: 'l', f: 'SSI'},
    0x1D62E: {c: 'm', f: 'SSI'},
    0x1D62F: {c: 'n', f: 'SSI'},
    0x1D630: {c: 'o', f: 'SSI'},
    0x1D631: {c: 'p', f: 'SSI'},
    0x1D632: {c: 'q', f: 'SSI'},
    0x1D633: {c: 'r', f: 'SSI'},
    0x1D634: {c: 's', f: 'SSI'},
    0x1D635: {c: 't', f: 'SSI'},
    0x1D636: {c: 'u', f: 'SSI'},
    0x1D637: {c: 'v', f: 'SSI'},
    0x1D638: {c: 'w', f: 'SSI'},
    0x1D639: {c: 'x', f: 'SSI'},
    0x1D63A: {c: 'y', f: 'SSI'},
    0x1D63B: {c: 'z', f: 'SSI'},
    0x1D670: {c: 'A', f: 'T'},
    0x1D671: {c: 'B', f: 'T'},
    0x1D672: {c: 'C', f: 'T'},
    0x1D673: {c: 'D', f: 'T'},
    0x1D674: {c: 'E', f: 'T'},
    0x1D675: {c: 'F', f: 'T'},
    0x1D676: {c: 'G', f: 'T'},
    0x1D677: {c: 'H', f: 'T'},
    0x1D678: {c: 'I', f: 'T'},
    0x1D679: {c: 'J', f: 'T'},
    0x1D67A: {c: 'K', f: 'T'},
    0x1D67B: {c: 'L', f: 'T'},
    0x1D67C: {c: 'M', f: 'T'},
    0x1D67D: {c: 'N', f: 'T'},
    0x1D67E: {c: 'O', f: 'T'},
    0x1D67F: {c: 'P', f: 'T'},
    0x1D680: {c: 'Q', f: 'T'},
    0x1D681: {c: 'R', f: 'T'},
    0x1D682: {c: 'S', f: 'T'},
    0x1D683: {c: 'T', f: 'T'},
    0x1D684: {c: 'U', f: 'T'},
    0x1D685: {c: 'V', f: 'T'},
    0x1D686: {c: 'W', f: 'T'},
    0x1D687: {c: 'X', f: 'T'},
    0x1D688: {c: 'Y', f: 'T'},
    0x1D689: {c: 'Z', f: 'T'},
    0x1D68A: {c: 'a', f: 'T'},
    0x1D68B: {c: 'b', f: 'T'},
    0x1D68C: {c: 'c', f: 'T'},
    0x1D68D: {c: 'd', f: 'T'},
    0x1D68E: {c: 'e', f: 'T'},
    0x1D68F: {c: 'f', f: 'T'},
    0x1D690: {c: 'g', f: 'T'},
    0x1D691: {c: 'h', f: 'T'},
    0x1D692: {c: 'i', f: 'T'},
    0x1D693: {c: 'j', f: 'T'},
    0x1D694: {c: 'k', f: 'T'},
    0x1D695: {c: 'l', f: 'T'},
    0x1D696: {c: 'm', f: 'T'},
    0x1D697: {c: 'n', f: 'T'},
    0x1D698: {c: 'o', f: 'T'},
    0x1D699: {c: 'p', f: 'T'},
    0x1D69A: {c: 'q', f: 'T'},
    0x1D69B: {c: 'r', f: 'T'},
    0x1D69C: {c: 's', f: 'T'},
    0x1D69D: {c: 't', f: 'T'},
    0x1D69E: {c: 'u', f: 'T'},
    0x1D69F: {c: 'v', f: 'T'},
    0x1D6A0: {c: 'w', f: 'T'},
    0x1D6A1: {c: 'x', f: 'T'},
    0x1D6A2: {c: 'y', f: 'T'},
    0x1D6A3: {c: 'z', f: 'T'},
    0x1D6A8: {c: 'A', f: 'B'},
    0x1D6A9: {c: 'B', f: 'B'},
    0x1D6AA: {c: '\\393', f: 'B'},
    0x1D6AB: {c: '\\394', f: 'B'},
    0x1D6AC: {c: 'E', f: 'B'},
    0x1D6AD: {c: 'Z', f: 'B'},
    0x1D6AE: {c: 'H', f: 'B'},
    0x1D6AF: {c: '\\398', f: 'B'},
    0x1D6B0: {c: 'I', f: 'B'},
    0x1D6B1: {c: 'K', f: 'B'},
    0x1D6B2: {c: '\\39B', f: 'B'},
    0x1D6B3: {c: 'M', f: 'B'},
    0x1D6B4: {c: 'N', f: 'B'},
    0x1D6B5: {c: '\\39E', f: 'B'},
    0x1D6B6: {c: 'O', f: 'B'},
    0x1D6B7: {c: '\\3A0', f: 'B'},
    0x1D6B8: {c: 'P', f: 'B'},
    0x1D6BA: {c: '\\3A3', f: 'B'},
    0x1D6BB: {c: 'T', f: 'B'},
    0x1D6BC: {c: '\\3A5', f: 'B'},
    0x1D6BD: {c: '\\3A6', f: 'B'},
    0x1D6BE: {c: 'X', f: 'B'},
    0x1D6BF: {c: '\\3A8', f: 'B'},
    0x1D6C0: {c: '\\3A9', f: 'B'},
    0x1D6C1: {c: '\\2207', f: 'B'},
    0x1D6E2: {c: 'A', f: 'I'},
    0x1D6E3: {c: 'B', f: 'I'},
    0x1D6E4: {c: '\\393', f: 'I'},
    0x1D6E5: {c: '\\394', f: 'I'},
    0x1D6E6: {c: 'E', f: 'I'},
    0x1D6E7: {c: 'Z', f: 'I'},
    0x1D6E8: {c: 'H', f: 'I'},
    0x1D6E9: {c: '\\398', f: 'I'},
    0x1D6EA: {c: 'I', f: 'I'},
    0x1D6EB: {c: 'K', f: 'I'},
    0x1D6EC: {c: '\\39B', f: 'I'},
    0x1D6ED: {c: 'M', f: 'I'},
    0x1D6EE: {c: 'N', f: 'I'},
    0x1D6EF: {c: '\\39E', f: 'I'},
    0x1D6F0: {c: 'O', f: 'I'},
    0x1D6F1: {c: '\\3A0', f: 'I'},
    0x1D6F2: {c: 'P', f: 'I'},
    0x1D6F4: {c: '\\3A3', f: 'I'},
    0x1D6F5: {c: 'T', f: 'I'},
    0x1D6F6: {c: '\\3A5', f: 'I'},
    0x1D6F7: {c: '\\3A6', f: 'I'},
    0x1D6F8: {c: 'X', f: 'I'},
    0x1D6F9: {c: '\\3A8', f: 'I'},
    0x1D6FA: {c: '\\3A9', f: 'I'},
    0x1D6FC: {c: '\\3B1', f: 'I'},
    0x1D6FD: {c: '\\3B2', f: 'I'},
    0x1D6FE: {c: '\\3B3', f: 'I'},
    0x1D6FF: {c: '\\3B4', f: 'I'},
    0x1D700: {c: '\\3B5', f: 'I'},
    0x1D701: {c: '\\3B6', f: 'I'},
    0x1D702: {c: '\\3B7', f: 'I'},
    0x1D703: {c: '\\3B8', f: 'I'},
    0x1D704: {c: '\\3B9', f: 'I'},
    0x1D705: {c: '\\3BA', f: 'I'},
    0x1D706: {c: '\\3BB', f: 'I'},
    0x1D707: {c: '\\3BC', f: 'I'},
    0x1D708: {c: '\\3BD', f: 'I'},
    0x1D709: {c: '\\3BE', f: 'I'},
    0x1D70A: {c: '\\3BF', f: 'I'},
    0x1D70B: {c: '\\3C0', f: 'I'},
    0x1D70C: {c: '\\3C1', f: 'I'},
    0x1D70D: {c: '\\3C2', f: 'I'},
    0x1D70E: {c: '\\3C3', f: 'I'},
    0x1D70F: {c: '\\3C4', f: 'I'},
    0x1D710: {c: '\\3C5', f: 'I'},
    0x1D711: {c: '\\3C6', f: 'I'},
    0x1D712: {c: '\\3C7', f: 'I'},
    0x1D713: {c: '\\3C8', f: 'I'},
    0x1D714: {c: '\\3C9', f: 'I'},
    0x1D715: {c: '\\2202'},
    0x1D716: {c: '\\3F5', f: 'I'},
    0x1D717: {c: '\\3D1', f: 'I'},
    0x1D718: {c: '\\E009', f: 'A'},
    0x1D719: {c: '\\3D5', f: 'I'},
    0x1D71A: {c: '\\3F1', f: 'I'},
    0x1D71B: {c: '\\3D6', f: 'I'},
    0x1D71C: {c: 'A', f: 'BI'},
    0x1D71D: {c: 'B', f: 'BI'},
    0x1D71E: {c: '\\393', f: 'BI'},
    0x1D71F: {c: '\\394', f: 'BI'},
    0x1D720: {c: 'E', f: 'BI'},
    0x1D721: {c: 'Z', f: 'BI'},
    0x1D722: {c: 'H', f: 'BI'},
    0x1D723: {c: '\\398', f: 'BI'},
    0x1D724: {c: 'I', f: 'BI'},
    0x1D725: {c: 'K', f: 'BI'},
    0x1D726: {c: '\\39B', f: 'BI'},
    0x1D727: {c: 'M', f: 'BI'},
    0x1D728: {c: 'N', f: 'BI'},
    0x1D729: {c: '\\39E', f: 'BI'},
    0x1D72A: {c: 'O', f: 'BI'},
    0x1D72B: {c: '\\3A0', f: 'BI'},
    0x1D72C: {c: 'P', f: 'BI'},
    0x1D72E: {c: '\\3A3', f: 'BI'},
    0x1D72F: {c: 'T', f: 'BI'},
    0x1D730: {c: '\\3A5', f: 'BI'},
    0x1D731: {c: '\\3A6', f: 'BI'},
    0x1D732: {c: 'X', f: 'BI'},
    0x1D733: {c: '\\3A8', f: 'BI'},
    0x1D734: {c: '\\3A9', f: 'BI'},
    0x1D736: {c: '\\3B1', f: 'BI'},
    0x1D737: {c: '\\3B2', f: 'BI'},
    0x1D738: {c: '\\3B3', f: 'BI'},
    0x1D739: {c: '\\3B4', f: 'BI'},
    0x1D73A: {c: '\\3B5', f: 'BI'},
    0x1D73B: {c: '\\3B6', f: 'BI'},
    0x1D73C: {c: '\\3B7', f: 'BI'},
    0x1D73D: {c: '\\3B8', f: 'BI'},
    0x1D73E: {c: '\\3B9', f: 'BI'},
    0x1D73F: {c: '\\3BA', f: 'BI'},
    0x1D740: {c: '\\3BB', f: 'BI'},
    0x1D741: {c: '\\3BC', f: 'BI'},
    0x1D742: {c: '\\3BD', f: 'BI'},
    0x1D743: {c: '\\3BE', f: 'BI'},
    0x1D744: {c: '\\3BF', f: 'BI'},
    0x1D745: {c: '\\3C0', f: 'BI'},
    0x1D746: {c: '\\3C1', f: 'BI'},
    0x1D747: {c: '\\3C2', f: 'BI'},
    0x1D748: {c: '\\3C3', f: 'BI'},
    0x1D749: {c: '\\3C4', f: 'BI'},
    0x1D74A: {c: '\\3C5', f: 'BI'},
    0x1D74B: {c: '\\3C6', f: 'BI'},
    0x1D74C: {c: '\\3C7', f: 'BI'},
    0x1D74D: {c: '\\3C8', f: 'BI'},
    0x1D74E: {c: '\\3C9', f: 'BI'},
    0x1D74F: {c: '\\2202', f: 'B'},
    0x1D750: {c: '\\3F5', f: 'BI'},
    0x1D751: {c: '\\3D1', f: 'BI'},
    0x1D752: {c: '\\E009', f: 'A'},
    0x1D753: {c: '\\3D5', f: 'BI'},
    0x1D754: {c: '\\3F1', f: 'BI'},
    0x1D755: {c: '\\3D6', f: 'BI'},
    0x1D756: {c: 'A', f: 'SSB'},
    0x1D757: {c: 'B', f: 'SSB'},
    0x1D758: {c: '\\393', f: 'SSB'},
    0x1D759: {c: '\\394', f: 'SSB'},
    0x1D75A: {c: 'E', f: 'SSB'},
    0x1D75B: {c: 'Z', f: 'SSB'},
    0x1D75C: {c: 'H', f: 'SSB'},
    0x1D75D: {c: '\\398', f: 'SSB'},
    0x1D75E: {c: 'I', f: 'SSB'},
    0x1D75F: {c: 'K', f: 'SSB'},
    0x1D760: {c: '\\39B', f: 'SSB'},
    0x1D761: {c: 'M', f: 'SSB'},
    0x1D762: {c: 'N', f: 'SSB'},
    0x1D763: {c: '\\39E', f: 'SSB'},
    0x1D764: {c: 'O', f: 'SSB'},
    0x1D765: {c: '\\3A0', f: 'SSB'},
    0x1D766: {c: 'P', f: 'SSB'},
    0x1D768: {c: '\\3A3', f: 'SSB'},
    0x1D769: {c: 'T', f: 'SSB'},
    0x1D76A: {c: '\\3A5', f: 'SSB'},
    0x1D76B: {c: '\\3A6', f: 'SSB'},
    0x1D76C: {c: 'X', f: 'SSB'},
    0x1D76D: {c: '\\3A8', f: 'SSB'},
    0x1D76E: {c: '\\3A9', f: 'SSB'},
    0x1D7CE: {c: '0', f: 'B'},
    0x1D7CF: {c: '1', f: 'B'},
    0x1D7D0: {c: '2', f: 'B'},
    0x1D7D1: {c: '3', f: 'B'},
    0x1D7D2: {c: '4', f: 'B'},
    0x1D7D3: {c: '5', f: 'B'},
    0x1D7D4: {c: '6', f: 'B'},
    0x1D7D5: {c: '7', f: 'B'},
    0x1D7D6: {c: '8', f: 'B'},
    0x1D7D7: {c: '9', f: 'B'},
    0x1D7E2: {c: '0', f: 'SS'},
    0x1D7E3: {c: '1', f: 'SS'},
    0x1D7E4: {c: '2', f: 'SS'},
    0x1D7E5: {c: '3', f: 'SS'},
    0x1D7E6: {c: '4', f: 'SS'},
    0x1D7E7: {c: '5', f: 'SS'},
    0x1D7E8: {c: '6', f: 'SS'},
    0x1D7E9: {c: '7', f: 'SS'},
    0x1D7EA: {c: '8', f: 'SS'},
    0x1D7EB: {c: '9', f: 'SS'},
    0x1D7EC: {c: '0', f: 'SSB'},
    0x1D7ED: {c: '1', f: 'SSB'},
    0x1D7EE: {c: '2', f: 'SSB'},
    0x1D7EF: {c: '3', f: 'SSB'},
    0x1D7F0: {c: '4', f: 'SSB'},
    0x1D7F1: {c: '5', f: 'SSB'},
    0x1D7F2: {c: '6', f: 'SSB'},
    0x1D7F3: {c: '7', f: 'SSB'},
    0x1D7F4: {c: '8', f: 'SSB'},
    0x1D7F5: {c: '9', f: 'SSB'},
    0x1D7F6: {c: '0', f: 'T'},
    0x1D7F7: {c: '1', f: 'T'},
    0x1D7F8: {c: '2', f: 'T'},
    0x1D7F9: {c: '3', f: 'T'},
    0x1D7FA: {c: '4', f: 'T'},
    0x1D7FB: {c: '5', f: 'T'},
    0x1D7FC: {c: '6', f: 'T'},
    0x1D7FD: {c: '7', f: 'T'},
    0x1D7FE: {c: '8', f: 'T'},
    0x1D7FF: {c: '9', f: 'T'},
});

const sansSerifBoldItalic = {
    0x131: [.458, 0, .256],
    0x237: [.458, .205, .286],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const sansSerifBoldItalic$1 = AddCSS(sansSerifBoldItalic, {
    0x131: {f: 'SSB'},
    0x237: {f: 'SSB'},
});

const sansSerifBold = {
    0x21: [.694, 0, .367],
    0x22: [.694, -0.442, .558],
    0x23: [.694, .193, .917],
    0x24: [.75, .056, .55],
    0x25: [.75, .056, 1.029],
    0x26: [.716, .022, .831],
    0x27: [.694, -0.442, .306],
    0x28: [.75, .249, .428],
    0x29: [.75, .25, .428],
    0x2A: [.75, -0.293, .55],
    0x2B: [.617, .116, .856],
    0x2C: [.146, .106, .306],
    0x2D: [.273, -0.186, .367],
    0x2E: [.146, 0, .306],
    0x2F: [.75, .249, .55],
    0x3A: [.458, 0, .306],
    0x3B: [.458, .106, .306],
    0x3D: [.407, -0.094, .856],
    0x3F: [.705, 0, .519],
    0x40: [.704, .011, .733],
    0x5B: [.75, .25, .343],
    0x5D: [.75, .25, .343],
    0x5E: [.694, -0.537, .55],
    0x5F: [-0.023, .11, .55],
    0x7E: [.344, -0.198, .55],
    0x131: [.458, 0, .256],
    0x237: [.458, .205, .286],
    0x300: [.694, -0.537, 0],
    0x301: [.694, -0.537, 0],
    0x302: [.694, -0.537, 0],
    0x303: [.694, -0.548, 0],
    0x304: [.66, -0.56, 0],
    0x306: [.694, -0.552, 0],
    0x307: [.695, -0.596, 0],
    0x308: [.695, -0.595, 0],
    0x30A: [.694, -0.538, 0],
    0x30B: [.694, -0.537, 0],
    0x30C: [.657, -0.5, 0],
    0x2013: [.327, -0.24, .55],
    0x2014: [.327, -0.24, 1.1],
    0x2015: [.327, -0.24, 1.1],
    0x2017: [-0.023, .11, .55],
    0x2018: [.694, -0.443, .306],
    0x2019: [.694, -0.442, .306],
    0x201C: [.694, -0.443, .558],
    0x201D: [.694, -0.442, .558],
    0x2044: [.75, .249, .55],
    0x2206: [.694, 0, .917],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const sansSerifBold$1 = AddCSS(sansSerifBold, {
    0x2015: {c: '\\2014'},
    0x2017: {c: '_'},
    0x2044: {c: '/'},
    0x2206: {c: '\\394'},
});

const sansSerifItalic = {
    0x21: [.694, 0, .319, {ic: .036}],
    0x22: [.694, -0.471, .5],
    0x23: [.694, .194, .833, {ic: .018}],
    0x24: [.75, .056, .5, {ic: .065}],
    0x25: [.75, .056, .833],
    0x26: [.716, .022, .758],
    0x27: [.694, -0.471, .278, {ic: .057}],
    0x28: [.75, .25, .389, {ic: .102}],
    0x29: [.75, .25, .389],
    0x2A: [.75, -0.306, .5, {ic: .068}],
    0x2B: [.583, .083, .778],
    0x2C: [.098, .125, .278],
    0x2D: [.259, -0.186, .333],
    0x2E: [.098, 0, .278],
    0x2F: [.75, .25, .5, {ic: .1}],
    0x30: [.678, .022, .5, {ic: .049}],
    0x31: [.678, 0, .5],
    0x32: [.678, 0, .5, {ic: .051}],
    0x33: [.678, .022, .5, {ic: .044}],
    0x34: [.656, 0, .5, {ic: .021}],
    0x35: [.656, .022, .5, {ic: .055}],
    0x36: [.678, .022, .5, {ic: .048}],
    0x37: [.656, .011, .5, {ic: .096}],
    0x38: [.678, .022, .5, {ic: .054}],
    0x39: [.677, .022, .5, {ic: .045}],
    0x3A: [.444, 0, .278],
    0x3B: [.444, .125, .278],
    0x3D: [.37, -0.13, .778, {ic: .018}],
    0x3F: [.704, 0, .472, {ic: .064}],
    0x40: [.705, .01, .667, {ic: .04}],
    0x5B: [.75, .25, .289, {ic: .136}],
    0x5D: [.75, .25, .289, {ic: .064}],
    0x5E: [.694, -0.527, .5, {ic: .033}],
    0x5F: [-0.038, .114, .5, {ic: .065}],
    0x7E: [.327, -0.193, .5, {ic: .06}],
    0x131: [.444, 0, .239, {ic: .019}],
    0x237: [.444, .204, .267, {ic: .019}],
    0x300: [.694, -0.527, 0],
    0x301: [.694, -0.527, 0, {ic: .063}],
    0x302: [.694, -0.527, 0, {ic: .033}],
    0x303: [.677, -0.543, 0, {ic: .06}],
    0x304: [.631, -0.552, 0, {ic: .064}],
    0x306: [.694, -0.508, 0, {ic: .073}],
    0x307: [.68, -0.576, 0],
    0x308: [.68, -0.582, 0, {ic: .04}],
    0x30A: [.693, -0.527, 0],
    0x30B: [.694, -0.527, 0, {ic: .063}],
    0x30C: [.654, -0.487, 0, {ic: .06}],
    0x391: [.694, 0, .667],
    0x392: [.694, 0, .667, {ic: .029}],
    0x393: [.691, 0, .542, {ic: .104}],
    0x394: [.694, 0, .833],
    0x395: [.691, 0, .597, {ic: .091}],
    0x396: [.694, 0, .611, {ic: .091}],
    0x397: [.694, 0, .708, {ic: .06}],
    0x398: [.715, .022, .778, {ic: .026}],
    0x399: [.694, 0, .278, {ic: .06}],
    0x39A: [.694, 0, .694, {ic: .091}],
    0x39B: [.694, 0, .611],
    0x39C: [.694, 0, .875, {ic: .054}],
    0x39D: [.694, 0, .708, {ic: .058}],
    0x39E: [.688, 0, .667, {ic: .098}],
    0x39F: [.716, .022, .736, {ic: .027}],
    0x3A0: [.691, 0, .708, {ic: .06}],
    0x3A1: [.694, 0, .639, {ic: .051}],
    0x3A3: [.694, 0, .722, {ic: .091}],
    0x3A4: [.688, 0, .681, {ic: .109}],
    0x3A5: [.716, 0, .778, {ic: .065}],
    0x3A6: [.694, 0, .722, {ic: .021}],
    0x3A7: [.694, 0, .667, {ic: .091}],
    0x3A8: [.694, 0, .778, {ic: .076}],
    0x3A9: [.716, 0, .722, {ic: .047}],
    0x2013: [.312, -0.236, .5, {ic: .065}],
    0x2014: [.312, -0.236, 1, {ic: .065}],
    0x2015: [.312, -0.236, 1, {ic: .065}],
    0x2017: [-0.038, .114, .5, {ic: .065}],
    0x2018: [.694, -0.471, .278, {ic: .058}],
    0x2019: [.694, -0.471, .278, {ic: .057}],
    0x201C: [.694, -0.471, .5, {ic: .114}],
    0x201D: [.694, -0.471, .5],
    0x2044: [.75, .25, .5, {ic: .1}],
    0x2206: [.694, 0, .833],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const sansSerifItalic$1 = AddCSS(sansSerifItalic, {
    0x391: {c: 'A'},
    0x392: {c: 'B'},
    0x395: {c: 'E'},
    0x396: {c: 'Z'},
    0x397: {c: 'H'},
    0x399: {c: 'I'},
    0x39A: {c: 'K'},
    0x39C: {c: 'M'},
    0x39D: {c: 'N'},
    0x39F: {c: 'O'},
    0x3A1: {c: 'P'},
    0x3A4: {c: 'T'},
    0x3A7: {c: 'X'},
    0x2015: {c: '\\2014'},
    0x2017: {c: '_'},
    0x2044: {c: '/'},
    0x2206: {c: '\\394'},
});

const sansSerif = {
    0x21: [.694, 0, .319],
    0x22: [.694, -0.471, .5],
    0x23: [.694, .194, .833],
    0x24: [.75, .056, .5],
    0x25: [.75, .056, .833],
    0x26: [.716, .022, .758],
    0x27: [.694, -0.471, .278],
    0x28: [.75, .25, .389],
    0x29: [.75, .25, .389],
    0x2A: [.75, -0.306, .5],
    0x2B: [.583, .082, .778],
    0x2C: [.098, .125, .278],
    0x2D: [.259, -0.186, .333],
    0x2E: [.098, 0, .278],
    0x2F: [.75, .25, .5],
    0x3A: [.444, 0, .278],
    0x3B: [.444, .125, .278],
    0x3D: [.37, -0.13, .778],
    0x3F: [.704, 0, .472],
    0x40: [.704, .011, .667],
    0x5B: [.75, .25, .289],
    0x5D: [.75, .25, .289],
    0x5E: [.694, -0.527, .5],
    0x5F: [-0.038, .114, .5],
    0x7E: [.327, -0.193, .5],
    0x131: [.444, 0, .239],
    0x237: [.444, .205, .267],
    0x300: [.694, -0.527, 0],
    0x301: [.694, -0.527, 0],
    0x302: [.694, -0.527, 0],
    0x303: [.677, -0.543, 0],
    0x304: [.631, -0.552, 0],
    0x306: [.694, -0.508, 0],
    0x307: [.68, -0.576, 0],
    0x308: [.68, -0.582, 0],
    0x30A: [.694, -0.527, 0],
    0x30B: [.694, -0.527, 0],
    0x30C: [.654, -0.487, 0],
    0x391: [.694, 0, .667],
    0x392: [.694, 0, .667],
    0x393: [.691, 0, .542],
    0x394: [.694, 0, .833],
    0x395: [.691, 0, .597],
    0x396: [.694, 0, .611],
    0x397: [.694, 0, .708],
    0x398: [.716, .021, .778],
    0x399: [.694, 0, .278],
    0x39A: [.694, 0, .694],
    0x39B: [.694, 0, .611],
    0x39C: [.694, 0, .875],
    0x39D: [.694, 0, .708],
    0x39E: [.688, 0, .667],
    0x39F: [.715, .022, .736],
    0x3A0: [.691, 0, .708],
    0x3A1: [.694, 0, .639],
    0x3A3: [.694, 0, .722],
    0x3A4: [.688, 0, .681],
    0x3A5: [.716, 0, .778],
    0x3A6: [.694, 0, .722],
    0x3A7: [.694, 0, .667],
    0x3A8: [.694, 0, .778],
    0x3A9: [.716, 0, .722],
    0x2013: [.312, -0.236, .5],
    0x2014: [.312, -0.236, 1],
    0x2015: [.312, -0.236, 1],
    0x2017: [-0.038, .114, .5],
    0x2018: [.694, -0.471, .278],
    0x2019: [.694, -0.471, .278],
    0x201C: [.694, -0.471, .5],
    0x201D: [.694, -0.471, .5],
    0x2044: [.75, .25, .5],
    0x2206: [.694, 0, .833],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const sansSerif$1 = AddCSS(sansSerif, {
    0x391: {c: 'A'},
    0x392: {c: 'B'},
    0x395: {c: 'E'},
    0x396: {c: 'Z'},
    0x397: {c: 'H'},
    0x399: {c: 'I'},
    0x39A: {c: 'K'},
    0x39C: {c: 'M'},
    0x39D: {c: 'N'},
    0x39F: {c: 'O'},
    0x3A1: {c: 'P'},
    0x3A4: {c: 'T'},
    0x3A7: {c: 'X'},
    0x2015: {c: '\\2014'},
    0x2017: {c: '_'},
    0x2044: {c: '/'},
    0x2206: {c: '\\394'},
});

const scriptBold = {
};

const script = {
};

const smallop = {
    0x28: [.85, .349, .458],
    0x29: [.85, .349, .458],
    0x2F: [.85, .349, .578],
    0x5B: [.85, .349, .417],
    0x5C: [.85, .349, .578],
    0x5D: [.85, .349, .417],
    0x7B: [.85, .349, .583],
    0x7D: [.85, .349, .583],
    0x2C6: [.744, -0.551, .556],
    0x2DC: [.722, -0.597, .556],
    0x302: [.744, -0.551, 0],
    0x303: [.722, -0.597, 0],
    0x2016: [.602, 0, .778],
    0x2044: [.85, .349, .578],
    0x2191: [.6, 0, .667],
    0x2193: [.6, 0, .667],
    0x21D1: [.599, 0, .778],
    0x21D3: [.6, 0, .778],
    0x220F: [.75, .25, .944],
    0x2210: [.75, .25, .944],
    0x2211: [.75, .25, 1.056],
    0x221A: [.85, .35, 1, {ic: .02}],
    0x2223: [.627, .015, .333],
    0x2225: [.627, .015, .556],
    0x222B: [.805, .306, .472, {ic: .138}],
    0x222C: [.805, .306, .819, {ic: .138}],
    0x222D: [.805, .306, 1.166, {ic: .138}],
    0x222E: [.805, .306, .472, {ic: .138}],
    0x22C0: [.75, .249, .833],
    0x22C1: [.75, .249, .833],
    0x22C2: [.75, .249, .833],
    0x22C3: [.75, .249, .833],
    0x2308: [.85, .349, .472],
    0x2309: [.85, .349, .472],
    0x230A: [.85, .349, .472],
    0x230B: [.85, .349, .472],
    0x2329: [.85, .35, .472],
    0x232A: [.85, .35, .472],
    0x23D0: [.602, 0, .667],
    0x2758: [.627, .015, .333],
    0x27E8: [.85, .35, .472],
    0x27E9: [.85, .35, .472],
    0x2A00: [.75, .25, 1.111],
    0x2A01: [.75, .25, 1.111],
    0x2A02: [.75, .25, 1.111],
    0x2A04: [.75, .249, .833],
    0x2A06: [.75, .249, .833],
    0x2A0C: [.805, .306, 1.638, {ic: .138}],
    0x3008: [.85, .35, .472],
    0x3009: [.85, .35, .472],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const smallop$1 = AddCSS(smallop, {
    0x2044: {c: '/'},
    0x2329: {c: '\\27E8'},
    0x232A: {c: '\\27E9'},
    0x2758: {c: '\\2223'},
    0x2A0C: {c: '\\222C\\222C'},
    0x3008: {c: '\\27E8'},
    0x3009: {c: '\\27E9'},
});

const texCalligraphicBold = {
    0x41: [.751, .049, .921, {ic: .068, sk: .224}],
    0x42: [.705, .017, .748, {sk: .16}],
    0x43: [.703, .02, .613, {sk: .16}],
    0x44: [.686, 0, .892, {sk: .0958}],
    0x45: [.703, .016, .607, {ic: .02, sk: .128}],
    0x46: [.686, .03, .814, {ic: .116, sk: .128}],
    0x47: [.703, .113, .682, {sk: .128}],
    0x48: [.686, .048, .987, {sk: .128}],
    0x49: [.686, 0, .642, {ic: .104, sk: .0319}],
    0x4A: [.686, .114, .779, {ic: .158, sk: .192}],
    0x4B: [.703, .017, .871, {sk: .0639}],
    0x4C: [.703, .017, .788, {sk: .16}],
    0x4D: [.703, .049, 1.378, {sk: .16}],
    0x4E: [.84, .049, .937, {ic: .168, sk: .0958}],
    0x4F: [.703, .017, .906, {sk: .128}],
    0x50: [.686, .067, .81, {ic: .036, sk: .0958}],
    0x51: [.703, .146, .939, {sk: .128}],
    0x52: [.686, .017, .99, {sk: .0958}],
    0x53: [.703, .016, .696, {ic: .025, sk: .16}],
    0x54: [.72, .069, .644, {ic: .303, sk: .0319}],
    0x55: [.686, .024, .715, {ic: .056, sk: .0958}],
    0x56: [.686, .077, .737, {ic: .037, sk: .0319}],
    0x57: [.686, .077, 1.169, {ic: .037, sk: .0958}],
    0x58: [.686, 0, .817, {ic: .089, sk: .16}],
    0x59: [.686, .164, .759, {ic: .038, sk: .0958}],
    0x5A: [.686, 0, .818, {ic: .035, sk: .16}],
    0x131: [.452, .008, .394, {sk: .0319}],
    0x237: [.451, .201, .439, {sk: .0958}],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const texCalligraphicBold$1 = AddCSS(texCalligraphicBold, {
    0x131: {f: 'B'},
    0x237: {f: 'B'},
});

const texCalligraphic = {
    0x41: [.728, .05, .798, {ic: .021, sk: .194}],
    0x42: [.705, .022, .657, {sk: .139}],
    0x43: [.705, .025, .527, {sk: .139}],
    0x44: [.683, 0, .771, {sk: .0833}],
    0x45: [.705, .022, .528, {ic: .036, sk: .111}],
    0x46: [.683, .032, .719, {ic: .11, sk: .111}],
    0x47: [.704, .119, .595, {sk: .111}],
    0x48: [.683, .048, .845, {sk: .111}],
    0x49: [.683, 0, .545, {ic: .097, sk: .0278}],
    0x4A: [.683, .119, .678, {ic: .161, sk: .167}],
    0x4B: [.705, .022, .762, {sk: .0556}],
    0x4C: [.705, .022, .69, {sk: .139}],
    0x4D: [.705, .05, 1.201, {sk: .139}],
    0x4E: [.789, .05, .82, {ic: .159, sk: .0833}],
    0x4F: [.705, .022, .796, {sk: .111}],
    0x50: [.683, .057, .696, {ic: .037, sk: .0833}],
    0x51: [.705, .131, .817, {sk: .111}],
    0x52: [.682, .022, .848, {sk: .0833}],
    0x53: [.705, .022, .606, {ic: .036, sk: .139}],
    0x54: [.717, .068, .545, {ic: .288, sk: .0278}],
    0x55: [.683, .028, .626, {ic: .061, sk: .0833}],
    0x56: [.683, .052, .613, {ic: .045, sk: .0278}],
    0x57: [.683, .053, .988, {ic: .046, sk: .0833}],
    0x58: [.683, 0, .713, {ic: .094, sk: .139}],
    0x59: [.683, .143, .668, {ic: .046, sk: .0833}],
    0x5A: [.683, 0, .725, {ic: .042, sk: .139}],
};

const texMathit = {
    0x41: [.716, 0, .743],
    0x42: [.683, 0, .704],
    0x43: [.705, .021, .716],
    0x44: [.683, 0, .755],
    0x45: [.68, 0, .678],
    0x46: [.68, 0, .653],
    0x47: [.705, .022, .774],
    0x48: [.683, 0, .743],
    0x49: [.683, 0, .386],
    0x4A: [.683, .021, .525],
    0x4B: [.683, 0, .769],
    0x4C: [.683, 0, .627],
    0x4D: [.683, 0, .897],
    0x4E: [.683, 0, .743],
    0x4F: [.704, .022, .767],
    0x50: [.683, 0, .678],
    0x51: [.704, .194, .767],
    0x52: [.683, .022, .729],
    0x53: [.705, .022, .562],
    0x54: [.677, 0, .716],
    0x55: [.683, .022, .743],
    0x56: [.683, .022, .743],
    0x57: [.683, .022, .999],
    0x58: [.683, 0, .743],
    0x59: [.683, 0, .743],
    0x5A: [.683, 0, .613],
    0x61: [.442, .011, .511],
    0x62: [.694, .011, .46],
    0x63: [.441, .01, .46],
    0x64: [.694, .011, .511],
    0x65: [.442, .01, .46],
    0x66: [.705, .204, .307],
    0x67: [.442, .205, .46],
    0x68: [.694, .011, .511],
    0x69: [.656, .01, .307],
    0x6A: [.656, .204, .307],
    0x6B: [.694, .011, .46],
    0x6C: [.694, .011, .256],
    0x6D: [.442, .011, .818],
    0x6E: [.442, .011, .562],
    0x6F: [.442, .011, .511],
    0x70: [.442, .194, .511],
    0x71: [.442, .194, .46],
    0x72: [.442, .011, .422],
    0x73: [.442, .011, .409],
    0x74: [.626, .011, .332],
    0x75: [.441, .011, .537],
    0x76: [.443, .01, .46],
    0x77: [.443, .011, .664],
    0x78: [.442, .011, .464],
    0x79: [.441, .205, .486],
    0x7A: [.442, .011, .409],
};

const texOldstyleBold = {
    0x30: [.46, .017, .575],
    0x31: [.461, 0, .575],
    0x32: [.46, 0, .575],
    0x33: [.461, .211, .575],
    0x34: [.469, .194, .575],
    0x35: [.461, .211, .575],
    0x36: [.66, .017, .575],
    0x37: [.476, .211, .575],
    0x38: [.661, .017, .575],
    0x39: [.461, .21, .575],
    0x41: [.751, .049, .921, {ic: .068, sk: .224}],
    0x42: [.705, .017, .748, {sk: .16}],
    0x43: [.703, .02, .613, {sk: .16}],
    0x44: [.686, 0, .892, {sk: .0958}],
    0x45: [.703, .016, .607, {ic: .02, sk: .128}],
    0x46: [.686, .03, .814, {ic: .116, sk: .128}],
    0x47: [.703, .113, .682, {sk: .128}],
    0x48: [.686, .048, .987, {sk: .128}],
    0x49: [.686, 0, .642, {ic: .104, sk: .0319}],
    0x4A: [.686, .114, .779, {ic: .158, sk: .192}],
    0x4B: [.703, .017, .871, {sk: .0639}],
    0x4C: [.703, .017, .788, {sk: .16}],
    0x4D: [.703, .049, 1.378, {sk: .16}],
    0x4E: [.84, .049, .937, {ic: .168, sk: .0958}],
    0x4F: [.703, .017, .906, {sk: .128}],
    0x50: [.686, .067, .81, {ic: .036, sk: .0958}],
    0x51: [.703, .146, .939, {sk: .128}],
    0x52: [.686, .017, .99, {sk: .0958}],
    0x53: [.703, .016, .696, {ic: .025, sk: .16}],
    0x54: [.72, .069, .644, {ic: .303, sk: .0319}],
    0x55: [.686, .024, .715, {ic: .056, sk: .0958}],
    0x56: [.686, .077, .737, {ic: .037, sk: .0319}],
    0x57: [.686, .077, 1.169, {ic: .037, sk: .0958}],
    0x58: [.686, 0, .817, {ic: .089, sk: .16}],
    0x59: [.686, .164, .759, {ic: .038, sk: .0958}],
    0x5A: [.686, 0, .818, {ic: .035, sk: .16}],
};

const texOldstyle = {
    0x30: [.452, .022, .5],
    0x31: [.453, 0, .5],
    0x32: [.453, 0, .5],
    0x33: [.452, .216, .5],
    0x34: [.464, .194, .5],
    0x35: [.453, .216, .5],
    0x36: [.665, .022, .5],
    0x37: [.463, .216, .5],
    0x38: [.666, .021, .5],
    0x39: [.453, .216, .5],
    0x41: [.728, .05, .798, {ic: .021, sk: .194}],
    0x42: [.705, .022, .657, {sk: .139}],
    0x43: [.705, .025, .527, {sk: .139}],
    0x44: [.683, 0, .771, {sk: .0833}],
    0x45: [.705, .022, .528, {ic: .036, sk: .111}],
    0x46: [.683, .032, .719, {ic: .11, sk: .111}],
    0x47: [.704, .119, .595, {sk: .111}],
    0x48: [.683, .048, .845, {sk: .111}],
    0x49: [.683, 0, .545, {ic: .097, sk: .0278}],
    0x4A: [.683, .119, .678, {ic: .161, sk: .167}],
    0x4B: [.705, .022, .762, {sk: .0556}],
    0x4C: [.705, .022, .69, {sk: .139}],
    0x4D: [.705, .05, 1.201, {sk: .139}],
    0x4E: [.789, .05, .82, {ic: .159, sk: .0833}],
    0x4F: [.705, .022, .796, {sk: .111}],
    0x50: [.683, .057, .696, {ic: .037, sk: .0833}],
    0x51: [.705, .131, .817, {sk: .111}],
    0x52: [.682, .022, .848, {sk: .0833}],
    0x53: [.705, .022, .606, {ic: .036, sk: .139}],
    0x54: [.717, .068, .545, {ic: .288, sk: .0278}],
    0x55: [.683, .028, .626, {ic: .061, sk: .0833}],
    0x56: [.683, .052, .613, {ic: .045, sk: .0278}],
    0x57: [.683, .053, .988, {ic: .046, sk: .0833}],
    0x58: [.683, 0, .713, {ic: .094, sk: .139}],
    0x59: [.683, .143, .668, {ic: .046, sk: .0833}],
    0x5A: [.683, 0, .725, {ic: .042, sk: .139}],
};

const texSize3 = {
    0x28: [1.45, .949, .736],
    0x29: [1.45, .949, .736],
    0x2F: [1.45, .949, 1.044],
    0x5B: [1.45, .949, .528],
    0x5C: [1.45, .949, 1.044],
    0x5D: [1.45, .949, .528],
    0x7B: [1.45, .949, .75],
    0x7D: [1.45, .949, .75],
    0x2C6: [.772, -0.564, 1.444],
    0x2DC: [.749, -0.61, 1.444],
    0x302: [.772, -0.564, 0],
    0x303: [.749, -0.61, 0],
    0x2044: [1.45, .949, 1.044],
    0x221A: [1.45, .95, 1, {ic: .02}],
    0x2308: [1.45, .949, .583],
    0x2309: [1.45, .949, .583],
    0x230A: [1.45, .949, .583],
    0x230B: [1.45, .949, .583],
    0x2329: [1.45, .95, .75],
    0x232A: [1.45, .949, .75],
    0x27E8: [1.45, .95, .75],
    0x27E9: [1.45, .949, .75],
    0x3008: [1.45, .95, .75],
    0x3009: [1.45, .949, .75],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const texSize3$1 = AddCSS(texSize3, {
    0x2044: {c: '/'},
    0x2329: {c: '\\27E8'},
    0x232A: {c: '\\27E9'},
    0x3008: {c: '\\27E8'},
    0x3009: {c: '\\27E9'},
});

const texSize4 = {
    0x28: [1.75, 1.249, .792],
    0x29: [1.75, 1.249, .792],
    0x2F: [1.75, 1.249, 1.278],
    0x5B: [1.75, 1.249, .583],
    0x5C: [1.75, 1.249, 1.278],
    0x5D: [1.75, 1.249, .583],
    0x7B: [1.75, 1.249, .806],
    0x7D: [1.75, 1.249, .806],
    0x2C6: [.845, -0.561, 1.889, {ic: .013}],
    0x2DC: [.823, -0.583, 1.889],
    0x302: [.845, -0.561, 0, {ic: .013}],
    0x303: [.823, -0.583, 0],
    0x2044: [1.75, 1.249, 1.278],
    0x221A: [1.75, 1.25, 1, {ic: .02}],
    0x2308: [1.75, 1.249, .639],
    0x2309: [1.75, 1.249, .639],
    0x230A: [1.75, 1.249, .639],
    0x230B: [1.75, 1.249, .639],
    0x2329: [1.75, 1.248, .806],
    0x232A: [1.75, 1.248, .806],
    0x239B: [1.154, .655, .875],
    0x239C: [.61, .01, .875],
    0x239D: [1.165, .644, .875],
    0x239E: [1.154, .655, .875],
    0x239F: [.61, .01, .875],
    0x23A0: [1.165, .644, .875],
    0x23A1: [1.154, .645, .667],
    0x23A2: [.602, 0, .667],
    0x23A3: [1.155, .644, .667],
    0x23A4: [1.154, .645, .667],
    0x23A5: [.602, 0, .667],
    0x23A6: [1.155, .644, .667],
    0x23A7: [.899, .01, .889],
    0x23A8: [1.16, .66, .889],
    0x23A9: [.01, .899, .889],
    0x23AA: [.29, .015, .889],
    0x23AB: [.899, .01, .889],
    0x23AC: [1.16, .66, .889],
    0x23AD: [.01, .899, .889],
    0x23B7: [.935, .885, 1.056],
    0x27E8: [1.75, 1.248, .806],
    0x27E9: [1.75, 1.248, .806],
    0x3008: [1.75, 1.248, .806],
    0x3009: [1.75, 1.248, .806],
    0xE000: [.625, .014, 1.056],
    0xE001: [.605, .014, 1.056, {ic: .02}],
    0xE150: [.12, .213, .45, {ic: .01}],
    0xE151: [.12, .213, .45, {ic: .024}],
    0xE152: [.333, 0, .45, {ic: .01}],
    0xE153: [.333, 0, .45, {ic: .024}],
    0xE154: [.32, .2, .4, {ic: .01}],
    0xE155: [.333, 0, .9, {ic: .01}],
    0xE156: [.12, .213, .9, {ic: .01}],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const texSize4$1 = AddCSS(texSize4, {
    0x2044: {c: '/'},
    0x2329: {c: '\\27E8'},
    0x232A: {c: '\\27E9'},
    0x3008: {c: '\\27E8'},
    0x3009: {c: '\\27E9'},
    0xE155: {c: '\\E153\\E152'},
    0xE156: {c: '\\E151\\E150'},
});

const texVariant = {
    0x2C6: [.845, -0.561, 2.333, {ic: .013}],
    0x2DC: [.899, -0.628, 2.333],
    0x302: [.845, -0.561, 0, {ic: .013}],
    0x303: [.899, -0.628, 0],
    0x3F0: [.434, .006, .667, {ic: .067}],
    0x210F: [.695, .013, .54, {ic: .022}],
    0x2190: [.437, -0.064, .5],
    0x2192: [.437, -0.064, .5],
    0x21CC: [.514, .014, 1],
    0x2204: [.86, .166, .556],
    0x2205: [.587, 0, .778],
    0x2212: [.27, -0.23, .5],
    0x2216: [.43, .023, .778],
    0x221D: [.472, -0.028, .778],
    0x2223: [.43, .023, .222],
    0x2224: [.43, .023, .222, {ic: .018}],
    0x2225: [.431, .023, .389],
    0x2226: [.431, .024, .389, {ic: .018}],
    0x223C: [.365, -0.132, .778],
    0x2248: [.481, -0.05, .778],
    0x2268: [.752, .284, .778],
    0x2269: [.752, .284, .778],
    0x2270: [.919, .421, .778],
    0x2271: [.919, .421, .778],
    0x2288: [.828, .33, .778],
    0x2289: [.828, .33, .778],
    0x228A: [.634, .255, .778],
    0x228B: [.634, .254, .778],
    0x22A8: [.694, 0, .611],
    0x22C5: [.189, 0, .278],
    0x2322: [.378, -0.122, .778],
    0x2323: [.378, -0.143, .778],
    0x25B3: [.575, .02, .722],
    0x25BD: [.576, .019, .722],
    0x2A87: [.801, .303, .778],
    0x2A88: [.801, .303, .778],
    0x2ACB: [.752, .332, .778],
    0x2ACC: [.752, .333, .778],
};

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const texVariant$1 = AddCSS(texVariant, {
    0x3F0: {c: '\\E009'},
    0x210F: {f: ''},
    0x2224: {c: '\\E006'},
    0x2226: {c: '\\E007'},
    0x2268: {c: '\\E00C'},
    0x2269: {c: '\\E00D'},
    0x2270: {c: '\\E011'},
    0x2271: {c: '\\E00E'},
    0x2288: {c: '\\E016'},
    0x2289: {c: '\\E018'},
    0x228A: {c: '\\E01A'},
    0x228B: {c: '\\E01B'},
    0x2A87: {c: '\\E010'},
    0x2A88: {c: '\\E00F'},
    0x2ACB: {c: '\\E017'},
    0x2ACC: {c: '\\E019'},
});

/*************************************************************
 *
 *  Copyright (c) 2018 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const HDW1 = [.75, .25, .875];
const HDW2 = [.85, .349, .667];
const HDW3 = [.583, .082, .5];
const VSIZES = [1, 1.2, 1.8, 2.4, 3];

const DELIM2F = {c: 0x2F, dir: V, sizes: VSIZES};
const DELIMAF = {c: 0xAF, dir: H, sizes: [.59], stretch: [0, 0xAF], HDW: [.59, -0.544, .5]};
const DELIM2C6 = {c: 0x2C6, dir: H, sizes: [.517, .817, 1.335, 1.777, 1.909]};
const DELIM2DC = {c: 0x2DC, dir: H, sizes: [.583, .805, 1.33, 1.773, 1.887]};
const DELIM2013 = {c: 0x2013, dir: H, sizes: [.5], stretch: [0, 0x2013], HDW: [.285, -0.248, .5]};
const DELIM2190 = {c: 0x2190, dir: H, sizes: [1], stretch: [0x2190, 0x2212], HDW: HDW3};
const DELIM2192 = {c: 0x2192, dir: H, sizes: [1], stretch: [0, 0x2212, 0x2192], HDW: HDW3};
const DELIM2194 = {c: 0x2194, dir: H, sizes: [1], stretch: [0x2190, 0x2212, 0x2192], HDW: HDW3};
const DELIM21A4 = {c: 0x21A4, dir: H, stretch: [0x2190, 0x2212, 0x2223], HDW: HDW3, min: 1.278};
const DELIM21A6 = {c: 0x21A6, dir: H, sizes: [1], stretch: [0x2223, 0x2212, 0x2192], HDW: HDW3};
const DELIM21D0 = {c: 0x21D0, dir: H, sizes: [1], stretch: [0x21D0, 0x3D], HDW: HDW3};
const DELIM21D2 = {c: 0x21D2, dir: H, sizes: [1], stretch: [0, 0x3D, 0x21D2], HDW: HDW3};
const DELIM21D4 = {c: 0x21D4, dir: H, sizes: [1], stretch: [0x21D0, 0x3D, 0x21D2], HDW: HDW3};
const DELIM2212 = {c: 0x2212, dir: H, sizes: [.778], stretch: [0, 0x2212], HDW: HDW3};
const DELIM2223 = {c: 0x2223, dir: V, sizes: [1], stretch: [0, 0x2223], HDW: [.627, .015, .333]};
const DELIM23DC = {c: 0x23DC, dir: H, sizes: [.778, 1], schar: [0x2322, 0x2322], stretch: [0xE150, 0xE154, 0xE151],
                   HDW: [.32, .2, .5]};
const DELIM23DD = {c: 0x23DD, dir: H, sizes: [.778, 1], schar: [0x2323, 0x2323], stretch: [0xE152, 0xE154, 0xE153],
                   HDW: [.32, .2, .5]};
const DELIM23DE = {c: 0x23DE, dir: H, stretch: [0xE150, 0xE154, 0xE151, 0xE155], HDW: [.32, .2, .5], min: 1.8};
const DELIM23DF = {c: 0x23DF, dir: H, stretch: [0xE152, 0xE154, 0xE153, 0xE156], HDW: [.32, .2, .5], min: 1.8};
const DELIM27E8 = {c: 0x27E8, dir: V, sizes: VSIZES};
const DELIM27E9 = {c: 0x27E9, dir: V, sizes: VSIZES};
const DELIM2906 = {c: 0x2906, dir: H, stretch: [0x21D0, 0x3D, 0x2223], HDW: HDW3, min: 1.278};
const DELIM2907 = {c: 0x2907, dir: H, stretch: [0x22A8, 0x3D, 0x21D2], HDW: HDW3, min: 1.278};


const delimiters = {
  0x28: {dir: V, sizes: VSIZES, stretch: [0x239B, 0x239C, 0x239D], HDW: [.85, .349, .875]},
  0x29: {dir: V, sizes: VSIZES, stretch: [0x239E, 0x239F, 0x23A0], HDW: [.85, .349, .875]},
  0x2D: DELIM2212,
  0x2F: DELIM2F,
  0x3D: {dir: H, sizes: [.767], stretch: [0, 0x3D], HDW: HDW3},
  0x5B: {dir: V, sizes: VSIZES, stretch: [0x23A1, 0x23A2, 0x23A3], HDW: HDW2},
  0x5C: {dir: V, sizes: VSIZES},
  0x5D: {dir: V, sizes: VSIZES, stretch: [0x23A4, 0x23A5, 0x23A6], HDW: HDW2},
  0x5E: DELIM2C6,
  0x5F: DELIM2013,
  0x7B: {dir: V, sizes: VSIZES, stretch: [0x23A7, 0x23AA, 0x23A9, 0x23A8], HDW: [.85, .349, .889]},
  0x7C: {dir: V, sizes: [1], stretch: [0, 0x2223], HDW: [.75, .25, .333]},
  0x7D: {dir: V, sizes: VSIZES, stretch: [0x23AB, 0x23AA, 0x23AD, 0x23AC], HDW: [.85, .349, .889]},
  0x7E: DELIM2DC,
  0xAF: DELIMAF,
  0x2C6: DELIM2C6,
  0x2C9: DELIMAF,
  0x2DC: DELIM2DC,
  0x302: DELIM2C6,
  0x303: DELIM2DC,
  0x332: DELIM2013,
  0x2013: DELIM2013,
  0x2014: DELIM2013,
  0x2015: DELIM2013,
  0x2016: {dir: V, sizes: [.602, 1], schar: [0, 0x2225], stretch: [0, 0x2225], HDW: [.602, 0, .556]},
  0x2017: DELIM2013,
  0x203E: DELIMAF,
  0x20D7: DELIM2192,
  0x2190: DELIM2190,
  0x2191: {dir: V, sizes: [.888], stretch: [0x2191, 0x23D0], HDW: [.6, 0, .667]},
  0x2192: DELIM2192,
  0x2193: {dir: V, sizes: [.888], stretch: [0, 0x23D0, 0x2193], HDW: [.6, 0, .667]},
  0x2194: DELIM2194,
  0x2195: {dir: V, sizes: [1.044], stretch: [0x2191, 0x23D0, 0x2193], HDW: HDW1},
  0x219E: {dir: H, sizes: [1], stretch: [0x219E, 0x2212], HDW: HDW3},
  0x21A0: {dir: H, sizes: [1], stretch: [0, 0x2212, 0x21A0], HDW: HDW3},
  0x21A4: DELIM21A4,
  0x21A5: {dir: V, stretch: [0x2191, 0x23D0, 0x22A5], HDW: HDW1, min: 1.555},
  0x21A6: DELIM21A6,
  0x21A7: {dir: V, stretch: [0x22A4, 0x23D0, 0x2193], HDW: HDW1, min: 1.555},
  0x21B0: {dir: V, sizes: [.722], stretch: [0x21B0, 0x23D0], HDW: HDW1},
  0x21B1: {dir: V, sizes: [.722], stretch: [0x21B1, 0x23D0], HDW: HDW1},
  0x21BC: {dir: H, sizes: [1], stretch: [0x21BC, 0x2212], HDW: HDW3},
  0x21BD: {dir: H, sizes: [1], stretch: [0x21BD, 0x2212], HDW: HDW3},
  0x21BE: {dir: V, sizes: [.888], stretch: [0x21BE, 0x23D0], HDW: HDW1},
  0x21BF: {dir: V, sizes: [.888], stretch: [0x21BF, 0x23D0], HDW: HDW1},
  0x21C0: {dir: H, sizes: [1], stretch: [0, 0x2212, 0x21C0], HDW: HDW3},
  0x21C1: {dir: H, sizes: [1], stretch: [0, 0x2212, 0x21C1], HDW: HDW3},
  0x21C2: {dir: V, sizes: [.888], stretch: [0, 0x23D0, 0x21C2], HDW: HDW1},
  0x21C3: {dir: V, sizes: [.888], stretch: [0, 0x23D0, 0x21C3], HDW: HDW1},
  0x21D0: DELIM21D0,
  0x21D1: {dir: V, sizes: [.888], stretch: [0x21D1, 0x2016], HDW: [.599, 0, .778]},
  0x21D2: DELIM21D2,
  0x21D3: {dir: V, sizes: [.888], stretch: [0, 0x2016, 0x21D3], HDW: [.6, 0, .778]},
  0x21D4: DELIM21D4,
  0x21D5: {dir: V, sizes: [1.044], stretch: [0x21D1, 0x2016, 0x21D3], HDW: [.75, .25, .778]},
  0x21DA: {dir: H, sizes: [1], stretch: [0x21DA, 0x2261], HDW: [.464, -0.036, .5]},
  0x21DB: {dir: H, sizes: [1], stretch: [0, 0x2261, 0x21DB], HDW: [.464, -0.036, .5]},
  0x2212: DELIM2212,
  0x2215: DELIM2F,
  0x221A: {dir: V, sizes: VSIZES, stretch: [0xE001, 0xE000, 0x23B7], HDW: [.85, .35, 1.056]},
  0x2223: DELIM2223,
  0x2225: {dir: V, sizes: [1], stretch: [0, 0x2225], HDW: [.627, .015, .556]},
  0x2308: {dir: V, sizes: VSIZES, stretch: [0x23A1, 0x23A2], HDW: HDW2},
  0x2309: {dir: V, sizes: VSIZES, stretch: [0x23A4, 0x23A5], HDW: HDW2},
  0x230A: {dir: V, sizes: VSIZES, stretch: [0, 0x23A2, 0x23A3], HDW: HDW2},
  0x230B: {dir: V, sizes: VSIZES, stretch: [0, 0x23A5, 0x23A6], HDW: HDW2},
  0x2312: DELIM23DC,
  0x2322: DELIM23DC,
  0x2323: DELIM23DD,
  0x2329: DELIM27E8,
  0x232A: DELIM27E9,
  0x23AA: {dir: V, sizes: [.32], stretch: [0x23AA, 0x23AA, 0x23AA], HDW: [.29, .015, .889]},
  0x23AF: DELIM2013,
  0x23B0: {dir: V, sizes: [.989], stretch: [0x23A7, 0x23AA, 0x23AD], HDW: [.75, .25, .889]},
  0x23B1: {dir: V, sizes: [.989], stretch: [0x23AB, 0x23AA, 0x23A9], HDW: [.75, .25, .889]},
  0x23B4: {dir: H, stretch: [0x250C, 0x2212, 0x2510], HDW: HDW3, min: 1},
  0x23B5: {dir: H, stretch: [0x2514, 0x2212, 0x2518], HDW: HDW3, min: 1},
  0x23D0: {dir: V, sizes: [.602, 1], schar: [0, 0x2223], stretch: [0, 0x2223], HDW: [.602, 0, .333]},
  0x23DC: DELIM23DC,
  0x23DD: DELIM23DD,
  0x23DE: DELIM23DE,
  0x23DF: DELIM23DF,
  0x23E0: {dir: H, stretch: [0x2CA, 0x2C9, 0x2CB], HDW: [.59, -0.544, .5], min: 1},
  0x23E1: {dir: H, stretch: [0x2CB, 0x2C9, 0x2CA], HDW: [.59, -0.544, .5], min: 1},
  0x2500: DELIM2013,
  0x2758: DELIM2223,
  0x27E8: DELIM27E8,
  0x27E9: DELIM27E9,
  0x27EE: {dir: V, sizes: [.989], stretch: [0x23A7, 0x23AA, 0x23A9], HDW: [.75, .25, .889]},
  0x27EF: {dir: V, sizes: [.989], stretch: [0x23AB, 0x23AA, 0x23AD], HDW: [.75, .25, .889]},
  0x27F5: DELIM2190,
  0x27F6: DELIM2192,
  0x27F7: DELIM2194,
  0x27F8: DELIM21D0,
  0x27F9: DELIM21D2,
  0x27FA: DELIM21D4,
  0x27FB: DELIM21A4,
  0x27FC: DELIM21A6,
  0x27FD: DELIM2906,
  0x27FE: DELIM2907,
  0x2906: DELIM2906,
  0x2907: DELIM2907,
  0x294E: {dir: H, stretch: [0x21BC, 0x2212, 0x21C0], HDW: HDW3, min: 2},
  0x294F: {dir: V, stretch: [0x21BE, 0x23D0, 0x21C2], HDW: HDW1, min: 1.776},
  0x2950: {dir: H, stretch: [0x21BD, 0x2212, 0x21C1], HDW: HDW3, min: 2},
  0x2951: {dir: V, stretch: [0x21BF, 0x23D0, 0x21C3], HDW: HDW1, min: .5},
  0x295A: {dir: H, stretch: [0x21BC, 0x2212, 0x2223], HDW: HDW3, min: 1.278},
  0x295B: {dir: H, stretch: [0x2223, 0x2212, 0x21C0], HDW: HDW3, min: 1.278},
  0x295C: {dir: V, stretch: [0x21BE, 0x23D0, 0x22A5], HDW: HDW1, min: 1.556},
  0x295D: {dir: V, stretch: [0x22A4, 0x23D0, 0x21C2], HDW: HDW1, min: 1.556},
  0x295E: {dir: H, stretch: [0x21BD, 0x2212, 0x2223], HDW: HDW3, min: 1.278},
  0x295F: {dir: H, stretch: [0x2223, 0x2212, 0x21C1], HDW: HDW3, min: 1.278},
  0x2960: {dir: V, stretch: [0x21BF, 0x23D0, 0x22A5], HDW: HDW1, min: 1.776},
  0x2961: {dir: V, stretch: [0x22A4, 0x23D0, 0x21C3], HDW: HDW1, min: 1.776},
  0x3008: DELIM27E8,
  0x3009: DELIM27E9,
  0xFE37: DELIM23DE,
  0xFE38: DELIM23DF,
};

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/*=================================================================================*/
/**
 *  The TeXFont class
 */
class TeXFont extends
CommonTeXFontMixin(CHTMLFontData) {

  /**
   * Fonts to prefix any explicit ones
   */
   static __initStatic() {this.defaultCssFamilyPrefix = 'MJXZERO';}

  /**
   * The classes to use for each variant
   */
   static __initStatic2() {this.defaultVariantClasses = {
    'normal': 'mjx-n',
    'bold': 'mjx-b',
    'italic': 'mjx-i',
    'bold-italic': 'mjx-b mjx-i',
    'double-struck': 'mjx-ds mjx-b',
    'fraktur': 'mjx-fr',
    'bold-fraktur': 'mjx-fr mjx-b',
    'script': 'mjx-sc mjx-i',
    'bold-script': 'mjx-sc mjx-b mjx-i',
    'sans-serif': 'mjx-ss',
    'bold-sans-serif': 'mjx-ss mjx-b',
    'sans-serif-italic': 'mjx-ss mjx-i',
    'sans-serif-bold-italic': 'mjx-ss mjx-b mjx-i',
    'monospace': 'mjx-ty',
    '-smallop': 'mjx-sop',
    '-largeop': 'mjx-lop',
    '-size3': 'mjx-s3',
    '-size4': 'mjx-s4',
    '-tex-calligraphic': 'mjx-cal mjx-i',
    '-tex-bold-calligraphic': 'mjx-cal mjx-b',
    '-tex-mathit': 'mjx-mit mjx-i',
    '-tex-oldstyle': 'mjx-os',
    '-tex-bold-oldstyle': 'mjx-os mjx-b',
    '-tex-variant': 'mjx-var'
  };}

  /**
   * The letters that identify the default font for each varaint
   */
   static __initStatic3() {this.defaultVariantLetters = {
    'normal': '',
    'bold': 'B',
    'italic': 'MI',
    'bold-italic': 'BI',
    'double-struck': 'A',
    'fraktur': 'FR',
    'bold-fraktur': 'FRB',
    'script': 'SC',
    'bold-script': 'SCB',
    'sans-serif': 'SS',
    'bold-sans-serif': 'SSB',
    'sans-serif-italic': 'SSI',
    'sans-serif-bold-italic': 'SSBI',
    'monospace': 'T',
    '-smallop': 'S1',
    '-largeop': 'S2',
    '-size3': 'S3',
    '-size4': 'S4',
    '-tex-calligraphic': 'C',
    '-tex-bold-calligraphic': 'CB',
    '-tex-mathit': 'MI',
    '-tex-oldstyle': 'C',
    '-tex-bold-oldstyle': 'CB',
    '-tex-variant': 'A'
  };}

  /**
   *  The stretchy delimiter data
   */
   static __initStatic4() {this.defaultDelimiters = delimiters;}

  /**
   *  The character data by variant
   */
   static __initStatic5() {this.defaultChars = {
    'normal': normal$1,
    'bold': bold$1,
    'italic': italic$1,
    'bold-italic': boldItalic$1,
    'double-struck': doubleStruck,
    'fraktur': fraktur$1,
    'bold-fraktur': frakturBold$1,
    'script': script,
    'bold-script': scriptBold,
    'sans-serif': sansSerif$1,
    'bold-sans-serif': sansSerifBold$1,
    'sans-serif-italic': sansSerifItalic$1,
    'sans-serif-bold-italic': sansSerifBoldItalic$1,
    'monospace': monospace$1,
    '-smallop': smallop$1,
    '-largeop': largeop$1,
    '-size3': texSize3$1,
    '-size4': texSize4$1,
    '-tex-calligraphic': texCalligraphic,
    '-tex-bold-calligraphic': texCalligraphicBold$1,
    '-tex-mathit': texMathit,
    '-tex-oldstyle': texOldstyle,
    '-tex-bold-oldstyle': texOldstyleBold,
    '-tex-variant': texVariant$1
  };}

  /*=====================================================*/
  /**
   * The CSS styles needed for this font.
   */
   static __initStatic6() {this.defaultStyles = {
    ...CHTMLFontData.defaultStyles,

    '.MJX-TEX': {
      'font-family': 'MJXZERO, MJXTEX'
    },

    '.TEX-B': {
      'font-family': 'MJXZERO, MJXTEX-B'
    },

    '.TEX-I': {
      'font-family': 'MJXZERO, MJXTEX-I'
    },

    '.TEX-MI': {
      'font-family': 'MJXZERO, MJXTEX-MI'
    },

    '.TEX-BI': {
      'font-family': 'MJXZERO, MJXTEX-BI'
    },

    '.TEX-S1': {
      'font-family': 'MJXZERO, MJXTEX-S1'
    },

    '.TEX-S2': {
      'font-family': 'MJXZERO, MJXTEX-S2'
    },

    '.TEX-S3': {
      'font-family': 'MJXZERO, MJXTEX-S3'
    },

    '.TEX-S4': {
      'font-family': 'MJXZERO, MJXTEX-S4'
    },

    '.TEX-A': {
      'font-family': 'MJXZERO, MJXTEX-A'
    },

    '.TEX-C': {
      'font-family': 'MJXZERO, MJXTEX-C'
    },

    '.TEX-CB': {
      'font-family': 'MJXZERO, MJXTEX-CB'
    },

    '.TEX-FR': {
      'font-family': 'MJXZERO, MJXTEX-FR'
    },

    '.TEX-FRB': {
      'font-family': 'MJXZERO, MJXTEX-FRB'
    },

    '.TEX-SS': {
      'font-family': 'MJXZERO, MJXTEX-SS'
    },

    '.TEX-SSB': {
      'font-family': 'MJXZERO, MJXTEX-SSB'
    },

    '.TEX-SSI': {
      'font-family': 'MJXZERO, MJXTEX-SSI'
    },

    '.TEX-SC': {
      'font-family': 'MJXZERO, MJXTEX-SC'
    },

    '.TEX-T': {
      'font-family': 'MJXZERO, MJXTEX-T'
    },

    '.TEX-V': {
      'font-family': 'MJXZERO, MJXTEX-V'
    },

    '.TEX-VB': {
      'font-family': 'MJXZERO, MJXTEX-VB'
    },

    'mjx-stretchy-v mjx-c, mjx-stretchy-h mjx-c': {
      'font-family': 'MJXZERO, MJXTEX-S1, MJXTEX-S4, MJXTEX, MJXTEX-A ! important'
    }
  };}

  /**
   * The default @font-face declarations with %%URL%% where the font path should go
   */
   static __initStatic7() {this.defaultFonts = {
    ...CHTMLFontData.defaultFonts,

    '@font-face /* 1 */': {
      'font-family': 'MJXTEX',
      src: 'url("%%URL%%/MathJax_Main-Regular.woff") format("woff")'
    },

    '@font-face /* 2 */': {
      'font-family': 'MJXTEX-B',
      src: 'url("%%URL%%/MathJax_Main-Bold.woff") format("woff")'
    },

    '@font-face /* 3 */': {
      'font-family': 'MJXTEX-I',
      src: 'url("%%URL%%/MathJax_Math-Italic.woff") format("woff")'
    },

    '@font-face /* 4 */': {
      'font-family': 'MJXTEX-MI',
      src: 'url("%%URL%%/MathJax_Main-Italic.woff") format("woff")'
    },

    '@font-face /* 5 */': {
      'font-family': 'MJXTEX-BI',
      src: 'url("%%URL%%/MathJax_Math-BoldItalic.woff") format("woff")'
    },

    '@font-face /* 6 */': {
      'font-family': 'MJXTEX-S1',
      src: 'url("%%URL%%/MathJax_Size1-Regular.woff") format("woff")'
    },

    '@font-face /* 7 */': {
      'font-family': 'MJXTEX-S2',
      src: 'url("%%URL%%/MathJax_Size2-Regular.woff") format("woff")'
    },

    '@font-face /* 8 */': {
      'font-family': 'MJXTEX-S3',
      src: 'url("%%URL%%/MathJax_Size3-Regular.woff") format("woff")'
    },

    '@font-face /* 9 */': {
      'font-family': 'MJXTEX-S4',
      src: 'url("%%URL%%/MathJax_Size4-Regular.woff") format("woff")'
    },

    '@font-face /* 10 */': {
      'font-family': 'MJXTEX-A',
      src: 'url("%%URL%%/MathJax_AMS-Regular.woff") format("woff")'
    },

    '@font-face /* 11 */': {
      'font-family': 'MJXTEX-C',
      src: 'url("%%URL%%/MathJax_Calligraphic-Regular.woff") format("woff")'
    },

    '@font-face /* 12 */': {
      'font-family': 'MJXTEX-CB',
      src: 'url("%%URL%%/MathJax_Calligraphic-Bold.woff") format("woff")'
    },

    '@font-face /* 13 */': {
      'font-family': 'MJXTEX-FR',
      src: 'url("%%URL%%/MathJax_Fraktur-Regular.woff") format("woff")'
    },

    '@font-face /* 14 */': {
      'font-family': 'MJXTEX-FRB',
      src: 'url("%%URL%%/MathJax_Fraktur-Bold.woff") format("woff")'
    },

    '@font-face /* 15 */': {
      'font-family': 'MJXTEX-SS',
      src: 'url("%%URL%%/MathJax_SansSerif-Regular.woff") format("woff")'
    },

    '@font-face /* 16 */': {
      'font-family': 'MJXTEX-SSB',
      src: 'url("%%URL%%/MathJax_SansSerif-Bold.woff") format("woff")'
    },

    '@font-face /* 17 */': {
      'font-family': 'MJXTEX-SSI',
      src: 'url("%%URL%%/MathJax_SansSerif-Italic.woff") format("woff")'
    },

    '@font-face /* 18 */': {
      'font-family': 'MJXTEX-SC',
      src: 'url("%%URL%%/MathJax_Script-Regular.woff") format("woff")'
    },

    '@font-face /* 19 */': {
      'font-family': 'MJXTEX-T',
      src: 'url("%%URL%%/MathJax_Typewriter-Regular.woff") format("woff")'
    },

    '@font-face /* 20 */': {
      'font-family': 'MJXTEX-V',
      src: 'url("%%URL%%/MathJax_Vector-Regular.woff") format("woff")'
    },

    '@font-face /* 21 */': {
      'font-family': 'MJXTEX-VB',
      src: 'url("%%URL%%/MathJax_Vector-Bold.woff") format("woff")'
    },
  };}

} TeXFont.__initStatic(); TeXFont.__initStatic2(); TeXFont.__initStatic3(); TeXFont.__initStatic4(); TeXFont.__initStatic5(); TeXFont.__initStatic6(); TeXFont.__initStatic7();

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/*****************************************************************/
/**
 *  Implements the CHTML class (extends AbstractOutputJax)
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 */
class CHTML extends
CommonOutputJax {

  /**
   * The name of this output jax
   */
   static __initStatic() {this.NAME = 'CHTML';}

  /**
   * @override
   */
   static __initStatic2() {this.OPTIONS = {
    ...CommonOutputJax.OPTIONS,
    adaptiveCSS: true,            // true means only produce CSS that is used in the processed equations
  };}

  /**
   *  The default styles for CommonHTML
   */
   static __initStatic3() {this.commonStyles = {
    'mjx-container[jax="CHTML"]': {'line-height': 0},

    'mjx-container [space="1"]': {'margin-left': '.111em'},
    'mjx-container [space="2"]': {'margin-left': '.167em'},
    'mjx-container [space="3"]': {'margin-left': '.222em'},
    'mjx-container [space="4"]': {'margin-left': '.278em'},
    'mjx-container [space="5"]': {'margin-left': '.333em'},

    'mjx-container [rspace="1"]': {'margin-right': '.111em'},
    'mjx-container [rspace="2"]': {'margin-right': '.167em'},
    'mjx-container [rspace="3"]': {'margin-right': '.222em'},
    'mjx-container [rspace="4"]': {'margin-right': '.278em'},
    'mjx-container [rspace="5"]': {'margin-right': '.333em'},

    'mjx-container [size="s"]' : {'font-size': '70.7%'},
    'mjx-container [size="ss"]': {'font-size': '50%'},
    'mjx-container [size="Tn"]': {'font-size': '60%'},
    'mjx-container [size="sm"]': {'font-size': '85%'},
    'mjx-container [size="lg"]': {'font-size': '120%'},
    'mjx-container [size="Lg"]': {'font-size': '144%'},
    'mjx-container [size="LG"]': {'font-size': '173%'},
    'mjx-container [size="hg"]': {'font-size': '207%'},
    'mjx-container [size="HG"]': {'font-size': '249%'},

    'mjx-container [width="full"]': {width: '100%'},

    'mjx-box': {display: 'inline-block'},
    'mjx-block': {display: 'block'},
    'mjx-itable': {display: 'inline-table'},
    'mjx-row': {display: 'table-row'},
    'mjx-row > *': {display: 'table-cell'},

    //
    //  These don't have Wrapper subclasses, so add their styles here
    //
    'mjx-mtext': {
      display: 'inline-block'
    },
    'mjx-mstyle': {
      display: 'inline-block'
    },
    'mjx-merror': {
      display: 'inline-block',
      color: 'red',
      'background-color': 'yellow'
    },
    'mjx-mphantom': {visibility: 'hidden'}

  };}

  /**
   * The ID for the stylesheet element for the styles for the SVG output
   */
   static __initStatic4() {this.STYLESHEETID = 'MJX-CHTML-styles';}

  /**
   *  Used to store the CHTMLWrapper factory,
   *  the FontData object, and the CssStyles object.
   */
  

  /**
   * The CHTML stylesheet, once it is constructed
   */
   __init() {this.chtmlStyles = null;}

  /**
   * @override
   * @constructor
   */
  constructor(options = null) {
    super(options, CHTMLWrapperFactory , TeXFont);CHTML.prototype.__init.call(this);    this.font.adaptiveCSS(this.options.adaptiveCSS);
  }

  /**
   * @override
   */
   escaped(math, html) {
    this.setDocument(html);
    return this.html('span', {}, [this.text(math.math)]);
  }

  /**
   * @override
   */
   styleSheet(html) {
    if (this.chtmlStyles && !this.options.adaptiveCSS) {
      return null;  // stylesheet is already added to the document
    }
    const sheet = this.chtmlStyles = super.styleSheet(html);
    this.adaptor.setAttribute(sheet, 'id', CHTML.STYLESHEETID);
    return sheet;
  }

  /**
   * @override
   */
   addClassStyles(CLASS) {
    if (!this.options.adaptiveCSS || (CLASS ).used) {
      if ((CLASS ).autoStyle && CLASS.kind !== 'unknown') {
        this.cssStyles.addStyles({
          ['mjx-' + CLASS.kind]: {
            display: 'inline-block',
            'text-align': 'left'
          }
        });
      }
      super.addClassStyles(CLASS);
    }
  }

  /**
   * @param {MmlNode} math  The MML node whose HTML is to be produced
   * @param {N} parent      The HTML node to contain the HTML
   */
   processMath(math, parent) {
    this.factory.wrap(math).toCHTML(parent);
  }

  /**
   * Clear the cache of which items need their styles to be output
   */
   clearCache() {
    this.cssStyles.clear();
    this.font.clearCache();
    for (const kind of this.factory.getKinds()) {
      this.factory.getNodeClass(kind).used = false;
    }

  }

  /*****************************************************************/

  /**
   * @override
   */
   unknownText(text, variant) {
    const styles = {};
    const scale = 100 / this.math.metrics.scale;
    if (scale !== 100) {
      styles['font-size'] = this.fixed(scale, 1) + '%';
      styles.padding = em(75 / scale) + ' 0 ' + em(20 / scale) + ' 0';
    }
    if (variant !== '-explicitFont') {
      const c = unicodeChars(text);
      if (c.length !== 1 || c[0] < 0x1D400 || c[0] > 0x1D7FF) {
        this.cssFontStyles(this.font.getCssFont(variant), styles);
      }
    }
    return this.html('mjx-utext', {variant: variant, style: styles}, [this.text(text)]);
  }

  /**
   * Measure the width of a text element by placing it in the page
   *  and looking up its size (fake the height and depth, since we can't measure that)
   *
   * @override
   */

   measureTextNode(text) {
    const adaptor = this.adaptor;
    text = adaptor.clone(text);
    const style = {position: 'absolute', 'white-space': 'nowrap'};
    const node = this.html('mjx-measure-text', {style}, [ text]);
    adaptor.append(adaptor.parent(this.math.start.node), this.container);
    adaptor.append(this.container, node);
    let w = adaptor.nodeSize(text, this.math.metrics.em)[0] / this.math.metrics.scale;
    adaptor.remove(this.container);
    adaptor.remove(node);
    return {w: w, h: .75, d: .2};
  }

} CHTML.__initStatic(); CHTML.__initStatic2(); CHTML.__initStatic3(); CHTML.__initStatic4();

// tslint:disable: quotemark
// const mml = new MathML({});
const handler = RegisterHTMLHandler(browserAdaptor());
// console.log(mml);
console.log("handler:", handler);
const mmlConfig = {};
const fontURL = `https://unpkg.com/mathjax-full@latest/ts/output/chtml/fonts/tex-woff-v2`;

// const fontURL = `https://unpkg.com/mathjax-full@${mathjax.version}/ts/output/chtml/fonts/tex-woff-v2`;
const htmlConfig = { fontURL };
const compileMath = (doc) => {
  const html = mathjax.document(document, {
    InputJax: [new MathML(mmlConfig)],
    OutputJax: new CHTML(htmlConfig),
  });
  // console.log(d);

  html.findMath().compile().getMetrics().typeset().updateDocument().clear();

  // d.compile();
  // const found = mml.findMath(document);

  // console.log(found);
  // const result = mml.compile(doc);

  // console.log("result:", result);
};

export { compileMath };
