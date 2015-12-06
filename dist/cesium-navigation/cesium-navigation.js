/**
 * @license almond 0.3.1 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                //Lop off the last part of baseParts, so that . matches the
                //"directory" and not name of the baseName's module. For instance,
                //baseName of "one/two/three", maps to "one/two/three.js", but we
                //want the directory, "one/two" for this normalization.
                name = baseParts.slice(0, baseParts.length - 1).concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

(function () {
    (function (p) {
        var y = this || (0, eval)('this'), w = y.document, M = y.navigator, u = y.jQuery, E = y.JSON;
        (function (p) {
            'function' === typeof define && define.amd ? define('Knockout', [
                'exports',
                'require'
            ], p) : 'function' === typeof require && 'object' === typeof exports && 'object' === typeof module ? p(module.exports || exports) : p(y.ko = {});
        }(function (N, O) {
            function J(a, d) {
                return null === a || typeof a in Q ? a === d : !1;
            }
            function R(a, d) {
                var c;
                return function () {
                    c || (c = setTimeout(function () {
                        c = p;
                        a();
                    }, d));
                };
            }
            function S(a, d) {
                var c;
                return function () {
                    clearTimeout(c);
                    c = setTimeout(a, d);
                };
            }
            function K(b, d, c, e) {
                a.d[b] = {
                    init: function (b, k, h, l, g) {
                        var m, x;
                        a.w(function () {
                            var q = a.a.c(k()), n = !c !== !q, r = !x;
                            if (r || d || n !== m)
                                r && a.Z.oa() && (x = a.a.la(a.e.childNodes(b), !0)), n ? (r || a.e.T(b, a.a.la(x)), a.Ja(e ? e(g, q) : g, b)) : a.e.ma(b), m = n;
                        }, null, { q: b });
                        return { controlsDescendantBindings: !0 };
                    }
                };
                a.h.ka[b] = !1;
                a.e.R[b] = !0;
            }
            var a = 'undefined' !== typeof N ? N : {};
            a.b = function (b, d) {
                for (var c = b.split('.'), e = a, f = 0; f < c.length - 1; f++)
                    e = e[c[f]];
                e[c[c.length - 1]] = d;
            };
            a.D = function (a, d, c) {
                a[d] = c;
            };
            a.version = '3.3.0';
            a.b('version', a.version);
            a.a = function () {
                function b(a, b) {
                    for (var c in a)
                        a.hasOwnProperty(c) && b(c, a[c]);
                }
                function d(a, b) {
                    if (b)
                        for (var c in b)
                            b.hasOwnProperty(c) && (a[c] = b[c]);
                    return a;
                }
                function c(a, b) {
                    a.__proto__ = b;
                    return a;
                }
                function e(b, c, g, d) {
                    var e = b[c].match(m) || [];
                    a.a.o(g.match(m), function (b) {
                        a.a.ga(e, b, d);
                    });
                    b[c] = e.join(' ');
                }
                var f = { __proto__: [] } instanceof Array, k = {}, h = {};
                k[M && /Firefox\/2/i.test(M.userAgent) ? 'KeyboardEvent' : 'UIEvents'] = [
                    'keyup',
                    'keydown',
                    'keypress'
                ];
                k.MouseEvents = 'click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave'.split(' ');
                b(k, function (a, b) {
                    if (b.length)
                        for (var c = 0, g = b.length; c < g; c++)
                            h[b[c]] = a;
                });
                var l = { propertychange: !0 }, g = w && function () {
                        for (var a = 3, b = w.createElement('div'), c = b.getElementsByTagName('i'); b.innerHTML = '<!--[if gt IE ' + ++a + ']><i></i><![endif]-->', c[0];);
                        return 4 < a ? a : p;
                    }(), m = /\S+/g;
                return {
                    Bb: [
                        'authenticity_token',
                        /^__RequestVerificationToken(_.*)?$/
                    ],
                    o: function (a, b) {
                        for (var c = 0, g = a.length; c < g; c++)
                            b(a[c], c);
                    },
                    m: function (a, b) {
                        if ('function' == typeof Array.prototype.indexOf)
                            return Array.prototype.indexOf.call(a, b);
                        for (var c = 0, g = a.length; c < g; c++)
                            if (a[c] === b)
                                return c;
                        return -1;
                    },
                    vb: function (a, b, c) {
                        for (var g = 0, d = a.length; g < d; g++)
                            if (b.call(c, a[g], g))
                                return a[g];
                        return null;
                    },
                    ya: function (b, c) {
                        var g = a.a.m(b, c);
                        0 < g ? b.splice(g, 1) : 0 === g && b.shift();
                    },
                    wb: function (b) {
                        b = b || [];
                        for (var c = [], g = 0, d = b.length; g < d; g++)
                            0 > a.a.m(c, b[g]) && c.push(b[g]);
                        return c;
                    },
                    Ka: function (a, b) {
                        a = a || [];
                        for (var c = [], g = 0, d = a.length; g < d; g++)
                            c.push(b(a[g], g));
                        return c;
                    },
                    xa: function (a, b) {
                        a = a || [];
                        for (var c = [], g = 0, d = a.length; g < d; g++)
                            b(a[g], g) && c.push(a[g]);
                        return c;
                    },
                    ia: function (a, b) {
                        if (b instanceof Array)
                            a.push.apply(a, b);
                        else
                            for (var c = 0, g = b.length; c < g; c++)
                                a.push(b[c]);
                        return a;
                    },
                    ga: function (b, c, g) {
                        var d = a.a.m(a.a.cb(b), c);
                        0 > d ? g && b.push(c) : g || b.splice(d, 1);
                    },
                    za: f,
                    extend: d,
                    Fa: c,
                    Ga: f ? c : d,
                    A: b,
                    pa: function (a, b) {
                        if (!a)
                            return a;
                        var c = {}, g;
                        for (g in a)
                            a.hasOwnProperty(g) && (c[g] = b(a[g], g, a));
                        return c;
                    },
                    Ra: function (b) {
                        for (; b.firstChild;)
                            a.removeNode(b.firstChild);
                    },
                    Jb: function (b) {
                        b = a.a.O(b);
                        for (var c = (b[0] && b[0].ownerDocument || w).createElement('div'), g = 0, d = b.length; g < d; g++)
                            c.appendChild(a.S(b[g]));
                        return c;
                    },
                    la: function (b, c) {
                        for (var g = 0, d = b.length, e = []; g < d; g++) {
                            var m = b[g].cloneNode(!0);
                            e.push(c ? a.S(m) : m);
                        }
                        return e;
                    },
                    T: function (b, c) {
                        a.a.Ra(b);
                        if (c)
                            for (var g = 0, d = c.length; g < d; g++)
                                b.appendChild(c[g]);
                    },
                    Qb: function (b, c) {
                        var g = b.nodeType ? [b] : b;
                        if (0 < g.length) {
                            for (var d = g[0], e = d.parentNode, m = 0, f = c.length; m < f; m++)
                                e.insertBefore(c[m], d);
                            m = 0;
                            for (f = g.length; m < f; m++)
                                a.removeNode(g[m]);
                        }
                    },
                    na: function (a, b) {
                        if (a.length) {
                            for (b = 8 === b.nodeType && b.parentNode || b; a.length && a[0].parentNode !== b;)
                                a.splice(0, 1);
                            if (1 < a.length) {
                                var c = a[0], g = a[a.length - 1];
                                for (a.length = 0; c !== g;)
                                    if (a.push(c), c = c.nextSibling, !c)
                                        return;
                                a.push(g);
                            }
                        }
                        return a;
                    },
                    Sb: function (a, b) {
                        7 > g ? a.setAttribute('selected', b) : a.selected = b;
                    },
                    ib: function (a) {
                        return null === a || a === p ? '' : a.trim ? a.trim() : a.toString().replace(/^[\s\xa0]+|[\s\xa0]+$/g, '');
                    },
                    Dc: function (a, b) {
                        a = a || '';
                        return b.length > a.length ? !1 : a.substring(0, b.length) === b;
                    },
                    jc: function (a, b) {
                        if (a === b)
                            return !0;
                        if (11 === a.nodeType)
                            return !1;
                        if (b.contains)
                            return b.contains(3 === a.nodeType ? a.parentNode : a);
                        if (b.compareDocumentPosition)
                            return 16 == (b.compareDocumentPosition(a) & 16);
                        for (; a && a != b;)
                            a = a.parentNode;
                        return !!a;
                    },
                    Qa: function (b) {
                        return a.a.jc(b, b.ownerDocument.documentElement);
                    },
                    tb: function (b) {
                        return !!a.a.vb(b, a.a.Qa);
                    },
                    v: function (a) {
                        return a && a.tagName && a.tagName.toLowerCase();
                    },
                    n: function (b, c, d) {
                        var m = g && l[c];
                        if (!m && u)
                            u(b).bind(c, d);
                        else if (m || 'function' != typeof b.addEventListener)
                            if ('undefined' != typeof b.attachEvent) {
                                var e = function (a) {
                                        d.call(b, a);
                                    }, f = 'on' + c;
                                b.attachEvent(f, e);
                                a.a.C.fa(b, function () {
                                    b.detachEvent(f, e);
                                });
                            } else
                                throw Error('Browser doesn\'t support addEventListener or attachEvent');
                        else
                            b.addEventListener(c, d, !1);
                    },
                    qa: function (b, c) {
                        if (!b || !b.nodeType)
                            throw Error('element must be a DOM node when calling triggerEvent');
                        var g;
                        'input' === a.a.v(b) && b.type && 'click' == c.toLowerCase() ? (g = b.type, g = 'checkbox' == g || 'radio' == g) : g = !1;
                        if (u && !g)
                            u(b).trigger(c);
                        else if ('function' == typeof w.createEvent)
                            if ('function' == typeof b.dispatchEvent)
                                g = w.createEvent(h[c] || 'HTMLEvents'), g.initEvent(c, !0, !0, y, 0, 0, 0, 0, 0, !1, !1, !1, !1, 0, b), b.dispatchEvent(g);
                            else
                                throw Error('The supplied element doesn\'t support dispatchEvent');
                        else if (g && b.click)
                            b.click();
                        else if ('undefined' != typeof b.fireEvent)
                            b.fireEvent('on' + c);
                        else
                            throw Error('Browser doesn\'t support triggering events');
                    },
                    c: function (b) {
                        return a.F(b) ? b() : b;
                    },
                    cb: function (b) {
                        return a.F(b) ? b.B() : b;
                    },
                    Ia: function (b, c, g) {
                        var d;
                        c && ('object' === typeof b.classList ? (d = b.classList[g ? 'add' : 'remove'], a.a.o(c.match(m), function (a) {
                            d.call(b.classList, a);
                        })) : 'string' === typeof b.className.baseVal ? e(b.className, 'baseVal', c, g) : e(b, 'className', c, g));
                    },
                    Ha: function (b, c) {
                        var g = a.a.c(c);
                        if (null === g || g === p)
                            g = '';
                        var d = a.e.firstChild(b);
                        !d || 3 != d.nodeType || a.e.nextSibling(d) ? a.e.T(b, [b.ownerDocument.createTextNode(g)]) : d.data = g;
                        a.a.mc(b);
                    },
                    Rb: function (a, b) {
                        a.name = b;
                        if (7 >= g)
                            try {
                                a.mergeAttributes(w.createElement('<input name=\'' + a.name + '\'/>'), !1);
                            } catch (c) {
                            }
                    },
                    mc: function (a) {
                        9 <= g && (a = 1 == a.nodeType ? a : a.parentNode, a.style && (a.style.zoom = a.style.zoom));
                    },
                    kc: function (a) {
                        if (g) {
                            var b = a.style.width;
                            a.style.width = 0;
                            a.style.width = b;
                        }
                    },
                    Bc: function (b, c) {
                        b = a.a.c(b);
                        c = a.a.c(c);
                        for (var g = [], d = b; d <= c; d++)
                            g.push(d);
                        return g;
                    },
                    O: function (a) {
                        for (var b = [], c = 0, g = a.length; c < g; c++)
                            b.push(a[c]);
                        return b;
                    },
                    Hc: 6 === g,
                    Ic: 7 === g,
                    M: g,
                    Db: function (b, c) {
                        for (var g = a.a.O(b.getElementsByTagName('input')).concat(a.a.O(b.getElementsByTagName('textarea'))), d = 'string' == typeof c ? function (a) {
                                    return a.name === c;
                                } : function (a) {
                                    return c.test(a.name);
                                }, m = [], e = g.length - 1; 0 <= e; e--)
                            d(g[e]) && m.push(g[e]);
                        return m;
                    },
                    yc: function (b) {
                        return 'string' == typeof b && (b = a.a.ib(b)) ? E && E.parse ? E.parse(b) : new Function('return ' + b)() : null;
                    },
                    jb: function (b, c, g) {
                        if (!E || !E.stringify)
                            throw Error('Cannot find JSON.stringify(). Some browsers (e.g., IE < 8) don\'t support it natively, but you can overcome this by adding a script reference to json2.js, downloadable from http://www.json.org/json2.js');
                        return E.stringify(a.a.c(b), c, g);
                    },
                    zc: function (c, g, d) {
                        d = d || {};
                        var m = d.params || {}, e = d.includeFields || this.Bb, f = c;
                        if ('object' == typeof c && 'form' === a.a.v(c))
                            for (var f = c.action, l = e.length - 1; 0 <= l; l--)
                                for (var k = a.a.Db(c, e[l]), h = k.length - 1; 0 <= h; h--)
                                    m[k[h].name] = k[h].value;
                        g = a.a.c(g);
                        var s = w.createElement('form');
                        s.style.display = 'none';
                        s.action = f;
                        s.method = 'post';
                        for (var p in g)
                            c = w.createElement('input'), c.type = 'hidden', c.name = p, c.value = a.a.jb(a.a.c(g[p])), s.appendChild(c);
                        b(m, function (a, b) {
                            var c = w.createElement('input');
                            c.type = 'hidden';
                            c.name = a;
                            c.value = b;
                            s.appendChild(c);
                        });
                        w.body.appendChild(s);
                        d.submitter ? d.submitter(s) : s.submit();
                        setTimeout(function () {
                            s.parentNode.removeChild(s);
                        }, 0);
                    }
                };
            }();
            a.b('utils', a.a);
            a.b('utils.arrayForEach', a.a.o);
            a.b('utils.arrayFirst', a.a.vb);
            a.b('utils.arrayFilter', a.a.xa);
            a.b('utils.arrayGetDistinctValues', a.a.wb);
            a.b('utils.arrayIndexOf', a.a.m);
            a.b('utils.arrayMap', a.a.Ka);
            a.b('utils.arrayPushAll', a.a.ia);
            a.b('utils.arrayRemoveItem', a.a.ya);
            a.b('utils.extend', a.a.extend);
            a.b('utils.fieldsIncludedWithJsonPost', a.a.Bb);
            a.b('utils.getFormFields', a.a.Db);
            a.b('utils.peekObservable', a.a.cb);
            a.b('utils.postJson', a.a.zc);
            a.b('utils.parseJson', a.a.yc);
            a.b('utils.registerEventHandler', a.a.n);
            a.b('utils.stringifyJson', a.a.jb);
            a.b('utils.range', a.a.Bc);
            a.b('utils.toggleDomNodeCssClass', a.a.Ia);
            a.b('utils.triggerEvent', a.a.qa);
            a.b('utils.unwrapObservable', a.a.c);
            a.b('utils.objectForEach', a.a.A);
            a.b('utils.addOrRemoveItem', a.a.ga);
            a.b('utils.setTextContent', a.a.Ha);
            a.b('unwrap', a.a.c);
            Function.prototype.bind || (Function.prototype.bind = function (a) {
                var d = this;
                if (1 === arguments.length)
                    return function () {
                        return d.apply(a, arguments);
                    };
                var c = Array.prototype.slice.call(arguments, 1);
                return function () {
                    var e = c.slice(0);
                    e.push.apply(e, arguments);
                    return d.apply(a, e);
                };
            });
            a.a.f = new function () {
                function a(b, k) {
                    var h = b[c];
                    if (!h || 'null' === h || !e[h]) {
                        if (!k)
                            return p;
                        h = b[c] = 'ko' + d++;
                        e[h] = {};
                    }
                    return e[h];
                }
                var d = 0, c = '__ko__' + new Date().getTime(), e = {};
                return {
                    get: function (c, d) {
                        var e = a(c, !1);
                        return e === p ? p : e[d];
                    },
                    set: function (c, d, e) {
                        if (e !== p || a(c, !1) !== p)
                            a(c, !0)[d] = e;
                    },
                    clear: function (a) {
                        var b = a[c];
                        return b ? (delete e[b], a[c] = null, !0) : !1;
                    },
                    I: function () {
                        return d++ + c;
                    }
                };
            }();
            a.b('utils.domData', a.a.f);
            a.b('utils.domData.clear', a.a.f.clear);
            a.a.C = new function () {
                function b(b, d) {
                    var e = a.a.f.get(b, c);
                    e === p && d && (e = [], a.a.f.set(b, c, e));
                    return e;
                }
                function d(c) {
                    var e = b(c, !1);
                    if (e)
                        for (var e = e.slice(0), l = 0; l < e.length; l++)
                            e[l](c);
                    a.a.f.clear(c);
                    a.a.C.cleanExternalData(c);
                    if (f[c.nodeType])
                        for (e = c.firstChild; c = e;)
                            e = c.nextSibling, 8 === c.nodeType && d(c);
                }
                var c = a.a.f.I(), e = {
                        1: !0,
                        8: !0,
                        9: !0
                    }, f = {
                        1: !0,
                        9: !0
                    };
                return {
                    fa: function (a, c) {
                        if ('function' != typeof c)
                            throw Error('Callback must be a function');
                        b(a, !0).push(c);
                    },
                    Pb: function (d, e) {
                        var f = b(d, !1);
                        f && (a.a.ya(f, e), 0 == f.length && a.a.f.set(d, c, p));
                    },
                    S: function (b) {
                        if (e[b.nodeType] && (d(b), f[b.nodeType])) {
                            var c = [];
                            a.a.ia(c, b.getElementsByTagName('*'));
                            for (var l = 0, g = c.length; l < g; l++)
                                d(c[l]);
                        }
                        return b;
                    },
                    removeNode: function (b) {
                        a.S(b);
                        b.parentNode && b.parentNode.removeChild(b);
                    },
                    cleanExternalData: function (a) {
                        u && 'function' == typeof u.cleanData && u.cleanData([a]);
                    }
                };
            }();
            a.S = a.a.C.S;
            a.removeNode = a.a.C.removeNode;
            a.b('cleanNode', a.S);
            a.b('removeNode', a.removeNode);
            a.b('utils.domNodeDisposal', a.a.C);
            a.b('utils.domNodeDisposal.addDisposeCallback', a.a.C.fa);
            a.b('utils.domNodeDisposal.removeDisposeCallback', a.a.C.Pb);
            (function () {
                a.a.ca = function (b, d) {
                    var c;
                    if (u)
                        if (u.parseHTML)
                            c = u.parseHTML(b, d) || [];
                        else {
                            if ((c = u.clean([b], d)) && c[0]) {
                                for (var e = c[0]; e.parentNode && 11 !== e.parentNode.nodeType;)
                                    e = e.parentNode;
                                e.parentNode && e.parentNode.removeChild(e);
                            }
                        }
                    else {
                        (e = d) || (e = w);
                        c = e.parentWindow || e.defaultView || y;
                        var f = a.a.ib(b).toLowerCase(), e = e.createElement('div'), f = f.match(/^<(thead|tbody|tfoot)/) && [
                                1,
                                '<table>',
                                '</table>'
                            ] || !f.indexOf('<tr') && [
                                2,
                                '<table><tbody>',
                                '</tbody></table>'
                            ] || (!f.indexOf('<td') || !f.indexOf('<th')) && [
                                3,
                                '<table><tbody><tr>',
                                '</tr></tbody></table>'
                            ] || [
                                0,
                                '',
                                ''
                            ], k = 'ignored<div>' + f[1] + b + f[2] + '</div>';
                        for ('function' == typeof c.innerShiv ? e.appendChild(c.innerShiv(k)) : e.innerHTML = k; f[0]--;)
                            e = e.lastChild;
                        c = a.a.O(e.lastChild.childNodes);
                    }
                    return c;
                };
                a.a.gb = function (b, d) {
                    a.a.Ra(b);
                    d = a.a.c(d);
                    if (null !== d && d !== p)
                        if ('string' != typeof d && (d = d.toString()), u)
                            u(b).html(d);
                        else
                            for (var c = a.a.ca(d, b.ownerDocument), e = 0; e < c.length; e++)
                                b.appendChild(c[e]);
                };
            }());
            a.b('utils.parseHtmlFragment', a.a.ca);
            a.b('utils.setHtml', a.a.gb);
            a.H = function () {
                function b(c, d) {
                    if (c)
                        if (8 == c.nodeType) {
                            var f = a.H.Lb(c.nodeValue);
                            null != f && d.push({
                                ic: c,
                                wc: f
                            });
                        } else if (1 == c.nodeType)
                            for (var f = 0, k = c.childNodes, h = k.length; f < h; f++)
                                b(k[f], d);
                }
                var d = {};
                return {
                    $a: function (a) {
                        if ('function' != typeof a)
                            throw Error('You can only pass a function to ko.memoization.memoize()');
                        var b = (4294967296 * (1 + Math.random()) | 0).toString(16).substring(1) + (4294967296 * (1 + Math.random()) | 0).toString(16).substring(1);
                        d[b] = a;
                        return '<!--[ko_memo:' + b + ']-->';
                    },
                    Wb: function (a, b) {
                        var f = d[a];
                        if (f === p)
                            throw Error('Couldn\'t find any memo with ID ' + a + '. Perhaps it\'s already been unmemoized.');
                        try {
                            return f.apply(null, b || []), !0;
                        } finally {
                            delete d[a];
                        }
                    },
                    Xb: function (c, d) {
                        var f = [];
                        b(c, f);
                        for (var k = 0, h = f.length; k < h; k++) {
                            var l = f[k].ic, g = [l];
                            d && a.a.ia(g, d);
                            a.H.Wb(f[k].wc, g);
                            l.nodeValue = '';
                            l.parentNode && l.parentNode.removeChild(l);
                        }
                    },
                    Lb: function (a) {
                        return (a = a.match(/^\[ko_memo\:(.*?)\]$/)) ? a[1] : null;
                    }
                };
            }();
            a.b('memoization', a.H);
            a.b('memoization.memoize', a.H.$a);
            a.b('memoization.unmemoize', a.H.Wb);
            a.b('memoization.parseMemoText', a.H.Lb);
            a.b('memoization.unmemoizeDomNodeAndDescendants', a.H.Xb);
            a.Sa = {
                throttle: function (b, d) {
                    b.throttleEvaluation = d;
                    var c = null;
                    return a.j({
                        read: b,
                        write: function (a) {
                            clearTimeout(c);
                            c = setTimeout(function () {
                                b(a);
                            }, d);
                        }
                    });
                },
                rateLimit: function (a, d) {
                    var c, e, f;
                    'number' == typeof d ? c = d : (c = d.timeout, e = d.method);
                    f = 'notifyWhenChangesStop' == e ? S : R;
                    a.Za(function (a) {
                        return f(a, c);
                    });
                },
                notify: function (a, d) {
                    a.equalityComparer = 'always' == d ? null : J;
                }
            };
            var Q = {
                undefined: 1,
                'boolean': 1,
                number: 1,
                string: 1
            };
            a.b('extenders', a.Sa);
            a.Ub = function (b, d, c) {
                this.da = b;
                this.La = d;
                this.hc = c;
                this.Gb = !1;
                a.D(this, 'dispose', this.p);
            };
            a.Ub.prototype.p = function () {
                this.Gb = !0;
                this.hc();
            };
            a.Q = function () {
                a.a.Ga(this, a.Q.fn);
                this.G = {};
                this.rb = 1;
            };
            var z = {
                U: function (b, d, c) {
                    var e = this;
                    c = c || 'change';
                    var f = new a.Ub(e, d ? b.bind(d) : b, function () {
                        a.a.ya(e.G[c], f);
                        e.ua && e.ua(c);
                    });
                    e.ja && e.ja(c);
                    e.G[c] || (e.G[c] = []);
                    e.G[c].push(f);
                    return f;
                },
                notifySubscribers: function (b, d) {
                    d = d || 'change';
                    'change' === d && this.Yb();
                    if (this.Ba(d))
                        try {
                            a.k.xb();
                            for (var c = this.G[d].slice(0), e = 0, f; f = c[e]; ++e)
                                f.Gb || f.La(b);
                        } finally {
                            a.k.end();
                        }
                },
                Aa: function () {
                    return this.rb;
                },
                pc: function (a) {
                    return this.Aa() !== a;
                },
                Yb: function () {
                    ++this.rb;
                },
                Za: function (b) {
                    var d = this, c = a.F(d), e, f, k;
                    d.ta || (d.ta = d.notifySubscribers, d.notifySubscribers = function (a, b) {
                        b && 'change' !== b ? 'beforeChange' === b ? d.pb(a) : d.ta(a, b) : d.qb(a);
                    });
                    var h = b(function () {
                        c && k === d && (k = d());
                        e = !1;
                        d.Wa(f, k) && d.ta(f = k);
                    });
                    d.qb = function (a) {
                        e = !0;
                        k = a;
                        h();
                    };
                    d.pb = function (a) {
                        e || (f = a, d.ta(a, 'beforeChange'));
                    };
                },
                Ba: function (a) {
                    return this.G[a] && this.G[a].length;
                },
                nc: function (b) {
                    if (b)
                        return this.G[b] && this.G[b].length || 0;
                    var d = 0;
                    a.a.A(this.G, function (a, b) {
                        d += b.length;
                    });
                    return d;
                },
                Wa: function (a, d) {
                    return !this.equalityComparer || !this.equalityComparer(a, d);
                },
                extend: function (b) {
                    var d = this;
                    b && a.a.A(b, function (b, e) {
                        var f = a.Sa[b];
                        'function' == typeof f && (d = f(d, e) || d);
                    });
                    return d;
                }
            };
            a.D(z, 'subscribe', z.U);
            a.D(z, 'extend', z.extend);
            a.D(z, 'getSubscriptionsCount', z.nc);
            a.a.za && a.a.Fa(z, Function.prototype);
            a.Q.fn = z;
            a.Hb = function (a) {
                return null != a && 'function' == typeof a.U && 'function' == typeof a.notifySubscribers;
            };
            a.b('subscribable', a.Q);
            a.b('isSubscribable', a.Hb);
            a.Z = a.k = function () {
                function b(a) {
                    c.push(e);
                    e = a;
                }
                function d() {
                    e = c.pop();
                }
                var c = [], e, f = 0;
                return {
                    xb: b,
                    end: d,
                    Ob: function (b) {
                        if (e) {
                            if (!a.Hb(b))
                                throw Error('Only subscribable things can act as dependencies');
                            e.La(b, b.ac || (b.ac = ++f));
                        }
                    },
                    u: function (a, c, e) {
                        try {
                            return b(), a.apply(c, e || []);
                        } finally {
                            d();
                        }
                    },
                    oa: function () {
                        if (e)
                            return e.w.oa();
                    },
                    Ca: function () {
                        if (e)
                            return e.Ca;
                    }
                };
            }();
            a.b('computedContext', a.Z);
            a.b('computedContext.getDependenciesCount', a.Z.oa);
            a.b('computedContext.isInitial', a.Z.Ca);
            a.b('computedContext.isSleeping', a.Z.Jc);
            a.b('ignoreDependencies', a.Gc = a.k.u);
            a.r = function (b) {
                function d() {
                    if (0 < arguments.length)
                        return d.Wa(c, arguments[0]) && (d.X(), c = arguments[0], d.W()), this;
                    a.k.Ob(d);
                    return c;
                }
                var c = b;
                a.Q.call(d);
                a.a.Ga(d, a.r.fn);
                d.B = function () {
                    return c;
                };
                d.W = function () {
                    d.notifySubscribers(c);
                };
                d.X = function () {
                    d.notifySubscribers(c, 'beforeChange');
                };
                a.D(d, 'peek', d.B);
                a.D(d, 'valueHasMutated', d.W);
                a.D(d, 'valueWillMutate', d.X);
                return d;
            };
            a.r.fn = { equalityComparer: J };
            var H = a.r.Ac = '__ko_proto__';
            a.r.fn[H] = a.r;
            a.a.za && a.a.Fa(a.r.fn, a.Q.fn);
            a.Ta = function (b, d) {
                return null === b || b === p || b[H] === p ? !1 : b[H] === d ? !0 : a.Ta(b[H], d);
            };
            a.F = function (b) {
                return a.Ta(b, a.r);
            };
            a.Da = function (b) {
                return 'function' == typeof b && b[H] === a.r || 'function' == typeof b && b[H] === a.j && b.qc ? !0 : !1;
            };
            a.b('observable', a.r);
            a.b('isObservable', a.F);
            a.b('isWriteableObservable', a.Da);
            a.b('isWritableObservable', a.Da);
            a.ba = function (b) {
                b = b || [];
                if ('object' != typeof b || !('length' in b))
                    throw Error('The argument passed when initializing an observable array must be an array, or null, or undefined.');
                b = a.r(b);
                a.a.Ga(b, a.ba.fn);
                return b.extend({ trackArrayChanges: !0 });
            };
            a.ba.fn = {
                remove: function (b) {
                    for (var d = this.B(), c = [], e = 'function' != typeof b || a.F(b) ? function (a) {
                                return a === b;
                            } : b, f = 0; f < d.length; f++) {
                        var k = d[f];
                        e(k) && (0 === c.length && this.X(), c.push(k), d.splice(f, 1), f--);
                    }
                    c.length && this.W();
                    return c;
                },
                removeAll: function (b) {
                    if (b === p) {
                        var d = this.B(), c = d.slice(0);
                        this.X();
                        d.splice(0, d.length);
                        this.W();
                        return c;
                    }
                    return b ? this.remove(function (c) {
                        return 0 <= a.a.m(b, c);
                    }) : [];
                },
                destroy: function (b) {
                    var d = this.B(), c = 'function' != typeof b || a.F(b) ? function (a) {
                            return a === b;
                        } : b;
                    this.X();
                    for (var e = d.length - 1; 0 <= e; e--)
                        c(d[e]) && (d[e]._destroy = !0);
                    this.W();
                },
                destroyAll: function (b) {
                    return b === p ? this.destroy(function () {
                        return !0;
                    }) : b ? this.destroy(function (d) {
                        return 0 <= a.a.m(b, d);
                    }) : [];
                },
                indexOf: function (b) {
                    var d = this();
                    return a.a.m(d, b);
                },
                replace: function (a, d) {
                    var c = this.indexOf(a);
                    0 <= c && (this.X(), this.B()[c] = d, this.W());
                }
            };
            a.a.o('pop push reverse shift sort splice unshift'.split(' '), function (b) {
                a.ba.fn[b] = function () {
                    var a = this.B();
                    this.X();
                    this.yb(a, b, arguments);
                    a = a[b].apply(a, arguments);
                    this.W();
                    return a;
                };
            });
            a.a.o(['slice'], function (b) {
                a.ba.fn[b] = function () {
                    var a = this();
                    return a[b].apply(a, arguments);
                };
            });
            a.a.za && a.a.Fa(a.ba.fn, a.r.fn);
            a.b('observableArray', a.ba);
            a.Sa.trackArrayChanges = function (b) {
                function d() {
                    if (!c) {
                        c = !0;
                        var g = b.notifySubscribers;
                        b.notifySubscribers = function (a, b) {
                            b && 'change' !== b || ++k;
                            return g.apply(this, arguments);
                        };
                        var d = [].concat(b.B() || []);
                        e = null;
                        f = b.U(function (c) {
                            c = [].concat(c || []);
                            if (b.Ba('arrayChange')) {
                                var g;
                                if (!e || 1 < k)
                                    e = a.a.Ma(d, c, { sparse: !0 });
                                g = e;
                            }
                            d = c;
                            e = null;
                            k = 0;
                            g && g.length && b.notifySubscribers(g, 'arrayChange');
                        });
                    }
                }
                if (!b.yb) {
                    var c = !1, e = null, f, k = 0, h = b.ja, l = b.ua;
                    b.ja = function (a) {
                        h && h.call(b, a);
                        'arrayChange' === a && d();
                    };
                    b.ua = function (a) {
                        l && l.call(b, a);
                        'arrayChange' !== a || b.Ba('arrayChange') || (f.p(), c = !1);
                    };
                    b.yb = function (b, d, f) {
                        function l(a, b, c) {
                            return h[h.length] = {
                                status: a,
                                value: b,
                                index: c
                            };
                        }
                        if (c && !k) {
                            var h = [], r = b.length, v = f.length, t = 0;
                            switch (d) {
                            case 'push':
                                t = r;
                            case 'unshift':
                                for (d = 0; d < v; d++)
                                    l('added', f[d], t + d);
                                break;
                            case 'pop':
                                t = r - 1;
                            case 'shift':
                                r && l('deleted', b[t], t);
                                break;
                            case 'splice':
                                d = Math.min(Math.max(0, 0 > f[0] ? r + f[0] : f[0]), r);
                                for (var r = 1 === v ? r : Math.min(d + (f[1] || 0), r), v = d + v - 2, t = Math.max(r, v), G = [], A = [], p = 2; d < t; ++d, ++p)
                                    d < r && A.push(l('deleted', b[d], d)), d < v && G.push(l('added', f[p], d));
                                a.a.Cb(A, G);
                                break;
                            default:
                                return;
                            }
                            e = h;
                        }
                    };
                }
            };
            a.w = a.j = function (b, d, c) {
                function e(a, b, c) {
                    if (I && b === g)
                        throw Error('A \'pure\' computed must not be called recursively');
                    B[a] = c;
                    c.sa = F++;
                    c.ea = b.Aa();
                }
                function f() {
                    var a, b;
                    for (a in B)
                        if (B.hasOwnProperty(a) && (b = B[a], b.da.pc(b.ea)))
                            return !0;
                }
                function k() {
                    !s && B && a.a.A(B, function (a, b) {
                        b.p && b.p();
                    });
                    B = null;
                    F = 0;
                    G = !0;
                    s = r = !1;
                }
                function h() {
                    var a = g.throttleEvaluation;
                    a && 0 <= a ? (clearTimeout(z), z = setTimeout(function () {
                        l(!0);
                    }, a)) : g.nb ? g.nb() : l(!0);
                }
                function l(b) {
                    if (!v && !G) {
                        if (y && y()) {
                            if (!t) {
                                w();
                                return;
                            }
                        } else
                            t = !1;
                        v = !0;
                        try {
                            var c = B, m = F, f = I ? p : !F;
                            a.k.xb({
                                La: function (a, b) {
                                    G || (m && c[b] ? (e(b, a, c[b]), delete c[b], --m) : B[b] || e(b, a, s ? { da: a } : a.U(h)));
                                },
                                w: g,
                                Ca: f
                            });
                            B = {};
                            F = 0;
                            try {
                                var l = d ? A.call(d) : A();
                            } finally {
                                a.k.end(), m && !s && a.a.A(c, function (a, b) {
                                    b.p && b.p();
                                }), r = !1;
                            }
                            g.Wa(n, l) && (s || q(n, 'beforeChange'), n = l, s ? g.Yb() : b && q(n));
                            f && q(n, 'awake');
                        } finally {
                            v = !1;
                        }
                        F || w();
                    }
                }
                function g() {
                    if (0 < arguments.length) {
                        if ('function' === typeof C)
                            C.apply(d, arguments);
                        else
                            throw Error('Cannot write a value to a ko.computed unless you specify a \'write\' option. If you wish to read the current value, don\'t pass any parameters.');
                        return this;
                    }
                    a.k.Ob(g);
                    (r || s && f()) && l();
                    return n;
                }
                function m() {
                    (r && !F || s && f()) && l();
                    return n;
                }
                function x() {
                    return r || 0 < F;
                }
                function q(a, b) {
                    g.notifySubscribers(a, b);
                }
                var n, r = !0, v = !1, t = !1, G = !1, A = b, I = !1, s = !1;
                A && 'object' == typeof A ? (c = A, A = c.read) : (c = c || {}, A || (A = c.read));
                if ('function' != typeof A)
                    throw Error('Pass a function that returns the value of the ko.computed');
                var C = c.write, D = c.disposeWhenNodeIsRemoved || c.q || null, u = c.disposeWhen || c.Pa, y = u, w = k, B = {}, F = 0, z = null;
                d || (d = c.owner);
                a.Q.call(g);
                a.a.Ga(g, a.j.fn);
                g.B = m;
                g.oa = function () {
                    return F;
                };
                g.qc = 'function' === typeof C;
                g.p = function () {
                    w();
                };
                g.$ = x;
                var T = g.Za;
                g.Za = function (a) {
                    T.call(g, a);
                    g.nb = function () {
                        g.pb(n);
                        r = !0;
                        g.qb(g);
                    };
                };
                c.pure ? (s = I = !0, g.ja = function (b) {
                    if (!G && s && 'change' == b) {
                        s = !1;
                        if (r || f())
                            B = null, F = 0, r = !0, l();
                        else {
                            var c = [];
                            a.a.A(B, function (a, b) {
                                c[b.sa] = a;
                            });
                            a.a.o(c, function (a, b) {
                                var c = B[a], g = c.da.U(h);
                                g.sa = b;
                                g.ea = c.ea;
                                B[a] = g;
                            });
                        }
                        G || q(n, 'awake');
                    }
                }, g.ua = function (b) {
                    G || 'change' != b || g.Ba('change') || (a.a.A(B, function (a, b) {
                        b.p && (B[a] = {
                            da: b.da,
                            sa: b.sa,
                            ea: b.ea
                        }, b.p());
                    }), s = !0, q(p, 'asleep'));
                }, g.bc = g.Aa, g.Aa = function () {
                    s && (r || f()) && l();
                    return g.bc();
                }) : c.deferEvaluation && (g.ja = function (a) {
                    'change' != a && 'beforeChange' != a || m();
                });
                a.D(g, 'peek', g.B);
                a.D(g, 'dispose', g.p);
                a.D(g, 'isActive', g.$);
                a.D(g, 'getDependenciesCount', g.oa);
                D && (t = !0, D.nodeType && (y = function () {
                    return !a.a.Qa(D) || u && u();
                }));
                s || c.deferEvaluation || l();
                D && x() && D.nodeType && (w = function () {
                    a.a.C.Pb(D, w);
                    k();
                }, a.a.C.fa(D, w));
                return g;
            };
            a.sc = function (b) {
                return a.Ta(b, a.j);
            };
            z = a.r.Ac;
            a.j[z] = a.r;
            a.j.fn = { equalityComparer: J };
            a.j.fn[z] = a.j;
            a.a.za && a.a.Fa(a.j.fn, a.Q.fn);
            a.b('dependentObservable', a.j);
            a.b('computed', a.j);
            a.b('isComputed', a.sc);
            a.Nb = function (b, d) {
                if ('function' === typeof b)
                    return a.w(b, d, { pure: !0 });
                b = a.a.extend({}, b);
                b.pure = !0;
                return a.w(b, d);
            };
            a.b('pureComputed', a.Nb);
            (function () {
                function b(a, f, k) {
                    k = k || new c();
                    a = f(a);
                    if ('object' != typeof a || null === a || a === p || a instanceof Date || a instanceof String || a instanceof Number || a instanceof Boolean)
                        return a;
                    var h = a instanceof Array ? [] : {};
                    k.save(a, h);
                    d(a, function (c) {
                        var g = f(a[c]);
                        switch (typeof g) {
                        case 'boolean':
                        case 'number':
                        case 'string':
                        case 'function':
                            h[c] = g;
                            break;
                        case 'object':
                        case 'undefined':
                            var d = k.get(g);
                            h[c] = d !== p ? d : b(g, f, k);
                        }
                    });
                    return h;
                }
                function d(a, b) {
                    if (a instanceof Array) {
                        for (var c = 0; c < a.length; c++)
                            b(c);
                        'function' == typeof a.toJSON && b('toJSON');
                    } else
                        for (c in a)
                            b(c);
                }
                function c() {
                    this.keys = [];
                    this.mb = [];
                }
                a.Vb = function (c) {
                    if (0 == arguments.length)
                        throw Error('When calling ko.toJS, pass the object you want to convert.');
                    return b(c, function (b) {
                        for (var c = 0; a.F(b) && 10 > c; c++)
                            b = b();
                        return b;
                    });
                };
                a.toJSON = function (b, c, d) {
                    b = a.Vb(b);
                    return a.a.jb(b, c, d);
                };
                c.prototype = {
                    save: function (b, c) {
                        var d = a.a.m(this.keys, b);
                        0 <= d ? this.mb[d] = c : (this.keys.push(b), this.mb.push(c));
                    },
                    get: function (b) {
                        b = a.a.m(this.keys, b);
                        return 0 <= b ? this.mb[b] : p;
                    }
                };
            }());
            a.b('toJS', a.Vb);
            a.b('toJSON', a.toJSON);
            (function () {
                a.i = {
                    s: function (b) {
                        switch (a.a.v(b)) {
                        case 'option':
                            return !0 === b.__ko__hasDomDataOptionValue__ ? a.a.f.get(b, a.d.options.ab) : 7 >= a.a.M ? b.getAttributeNode('value') && b.getAttributeNode('value').specified ? b.value : b.text : b.value;
                        case 'select':
                            return 0 <= b.selectedIndex ? a.i.s(b.options[b.selectedIndex]) : p;
                        default:
                            return b.value;
                        }
                    },
                    Y: function (b, d, c) {
                        switch (a.a.v(b)) {
                        case 'option':
                            switch (typeof d) {
                            case 'string':
                                a.a.f.set(b, a.d.options.ab, p);
                                '__ko__hasDomDataOptionValue__' in b && delete b.__ko__hasDomDataOptionValue__;
                                b.value = d;
                                break;
                            default:
                                a.a.f.set(b, a.d.options.ab, d), b.__ko__hasDomDataOptionValue__ = !0, b.value = 'number' === typeof d ? d : '';
                            }
                            break;
                        case 'select':
                            if ('' === d || null === d)
                                d = p;
                            for (var e = -1, f = 0, k = b.options.length, h; f < k; ++f)
                                if (h = a.i.s(b.options[f]), h == d || '' == h && d === p) {
                                    e = f;
                                    break;
                                }
                            if (c || 0 <= e || d === p && 1 < b.size)
                                b.selectedIndex = e;
                            break;
                        default:
                            if (null === d || d === p)
                                d = '';
                            b.value = d;
                        }
                    }
                };
            }());
            a.b('selectExtensions', a.i);
            a.b('selectExtensions.readValue', a.i.s);
            a.b('selectExtensions.writeValue', a.i.Y);
            a.h = function () {
                function b(b) {
                    b = a.a.ib(b);
                    123 === b.charCodeAt(0) && (b = b.slice(1, -1));
                    var c = [], d = b.match(e), x, h = [], n = 0;
                    if (d) {
                        d.push(',');
                        for (var r = 0, v; v = d[r]; ++r) {
                            var t = v.charCodeAt(0);
                            if (44 === t) {
                                if (0 >= n) {
                                    c.push(x && h.length ? {
                                        key: x,
                                        value: h.join('')
                                    } : { unknown: x || h.join('') });
                                    x = n = 0;
                                    h = [];
                                    continue;
                                }
                            } else if (58 === t) {
                                if (!n && !x && 1 === h.length) {
                                    x = h.pop();
                                    continue;
                                }
                            } else
                                47 === t && r && 1 < v.length ? (t = d[r - 1].match(f)) && !k[t[0]] && (b = b.substr(b.indexOf(v) + 1), d = b.match(e), d.push(','), r = -1, v = '/') : 40 === t || 123 === t || 91 === t ? ++n : 41 === t || 125 === t || 93 === t ? --n : x || h.length || 34 !== t && 39 !== t || (v = v.slice(1, -1));
                            h.push(v);
                        }
                    }
                    return c;
                }
                var d = [
                        'true',
                        'false',
                        'null',
                        'undefined'
                    ], c = /^(?:[$_a-z][$\w]*|(.+)(\.\s*[$_a-z][$\w]*|\[.+\]))$/i, e = RegExp('"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|/(?:[^/\\\\]|\\\\.)*/w*|[^\\s:,/][^,"\'{}()/:[\\]]*[^\\s,"\'{}()/:[\\]]|[^\\s]', 'g'), f = /[\])"'A-Za-z0-9_$]+$/, k = {
                        'in': 1,
                        'return': 1,
                        'typeof': 1
                    }, h = {};
                return {
                    ka: [],
                    V: h,
                    bb: b,
                    Ea: function (e, g) {
                        function m(b, g) {
                            var e;
                            if (!r) {
                                var l = a.getBindingHandler(b);
                                if (l && l.preprocess && !(g = l.preprocess(g, b, m)))
                                    return;
                                if (l = h[b])
                                    e = g, 0 <= a.a.m(d, e) ? e = !1 : (l = e.match(c), e = null === l ? !1 : l[1] ? 'Object(' + l[1] + ')' + l[2] : e), l = e;
                                l && k.push('\'' + b + '\':function(_z){' + e + '=_z}');
                            }
                            n && (g = 'function(){return ' + g + ' }');
                            f.push('\'' + b + '\':' + g);
                        }
                        g = g || {};
                        var f = [], k = [], n = g.valueAccessors, r = g.bindingParams, v = 'string' === typeof e ? b(e) : e;
                        a.a.o(v, function (a) {
                            m(a.key || a.unknown, a.value);
                        });
                        k.length && m('_ko_property_writers', '{' + k.join(',') + ' }');
                        return f.join(',');
                    },
                    vc: function (a, b) {
                        for (var c = 0; c < a.length; c++)
                            if (a[c].key == b)
                                return !0;
                        return !1;
                    },
                    ra: function (b, c, d, e, f) {
                        if (b && a.F(b))
                            !a.Da(b) || f && b.B() === e || b(e);
                        else if ((b = c.get('_ko_property_writers')) && b[d])
                            b[d](e);
                    }
                };
            }();
            a.b('expressionRewriting', a.h);
            a.b('expressionRewriting.bindingRewriteValidators', a.h.ka);
            a.b('expressionRewriting.parseObjectLiteral', a.h.bb);
            a.b('expressionRewriting.preProcessBindings', a.h.Ea);
            a.b('expressionRewriting._twoWayBindings', a.h.V);
            a.b('jsonExpressionRewriting', a.h);
            a.b('jsonExpressionRewriting.insertPropertyAccessorsIntoJson', a.h.Ea);
            (function () {
                function b(a) {
                    return 8 == a.nodeType && k.test(f ? a.text : a.nodeValue);
                }
                function d(a) {
                    return 8 == a.nodeType && h.test(f ? a.text : a.nodeValue);
                }
                function c(a, c) {
                    for (var e = a, f = 1, l = []; e = e.nextSibling;) {
                        if (d(e) && (f--, 0 === f))
                            return l;
                        l.push(e);
                        b(e) && f++;
                    }
                    if (!c)
                        throw Error('Cannot find closing comment tag to match: ' + a.nodeValue);
                    return null;
                }
                function e(a, b) {
                    var d = c(a, b);
                    return d ? 0 < d.length ? d[d.length - 1].nextSibling : a.nextSibling : null;
                }
                var f = w && '<!--test-->' === w.createComment('test').text, k = f ? /^\x3c!--\s*ko(?:\s+([\s\S]+))?\s*--\x3e$/ : /^\s*ko(?:\s+([\s\S]+))?\s*$/, h = f ? /^\x3c!--\s*\/ko\s*--\x3e$/ : /^\s*\/ko\s*$/, l = {
                        ul: !0,
                        ol: !0
                    };
                a.e = {
                    R: {},
                    childNodes: function (a) {
                        return b(a) ? c(a) : a.childNodes;
                    },
                    ma: function (c) {
                        if (b(c)) {
                            c = a.e.childNodes(c);
                            for (var d = 0, e = c.length; d < e; d++)
                                a.removeNode(c[d]);
                        } else
                            a.a.Ra(c);
                    },
                    T: function (c, d) {
                        if (b(c)) {
                            a.e.ma(c);
                            for (var e = c.nextSibling, f = 0, l = d.length; f < l; f++)
                                e.parentNode.insertBefore(d[f], e);
                        } else
                            a.a.T(c, d);
                    },
                    Mb: function (a, c) {
                        b(a) ? a.parentNode.insertBefore(c, a.nextSibling) : a.firstChild ? a.insertBefore(c, a.firstChild) : a.appendChild(c);
                    },
                    Fb: function (c, d, e) {
                        e ? b(c) ? c.parentNode.insertBefore(d, e.nextSibling) : e.nextSibling ? c.insertBefore(d, e.nextSibling) : c.appendChild(d) : a.e.Mb(c, d);
                    },
                    firstChild: function (a) {
                        return b(a) ? !a.nextSibling || d(a.nextSibling) ? null : a.nextSibling : a.firstChild;
                    },
                    nextSibling: function (a) {
                        b(a) && (a = e(a));
                        return a.nextSibling && d(a.nextSibling) ? null : a.nextSibling;
                    },
                    oc: b,
                    Fc: function (a) {
                        return (a = (f ? a.text : a.nodeValue).match(k)) ? a[1] : null;
                    },
                    Kb: function (c) {
                        if (l[a.a.v(c)]) {
                            var m = c.firstChild;
                            if (m) {
                                do
                                    if (1 === m.nodeType) {
                                        var f;
                                        f = m.firstChild;
                                        var h = null;
                                        if (f) {
                                            do
                                                if (h)
                                                    h.push(f);
                                                else if (b(f)) {
                                                    var k = e(f, !0);
                                                    k ? f = k : h = [f];
                                                } else
                                                    d(f) && (h = [f]);
                                            while (f = f.nextSibling);
                                        }
                                        if (f = h)
                                            for (h = m.nextSibling, k = 0; k < f.length; k++)
                                                h ? c.insertBefore(f[k], h) : c.appendChild(f[k]);
                                    }
                                while (m = m.nextSibling);
                            }
                        }
                    }
                };
            }());
            a.b('virtualElements', a.e);
            a.b('virtualElements.allowedBindings', a.e.R);
            a.b('virtualElements.emptyNode', a.e.ma);
            a.b('virtualElements.insertAfter', a.e.Fb);
            a.b('virtualElements.prepend', a.e.Mb);
            a.b('virtualElements.setDomNodeChildren', a.e.T);
            (function () {
                a.L = function () {
                    this.ec = {};
                };
                a.a.extend(a.L.prototype, {
                    nodeHasBindings: function (b) {
                        switch (b.nodeType) {
                        case 1:
                            return null != b.getAttribute('data-bind') || a.g.getComponentNameForNode(b);
                        case 8:
                            return a.e.oc(b);
                        default:
                            return !1;
                        }
                    },
                    getBindings: function (b, d) {
                        var c = this.getBindingsString(b, d), c = c ? this.parseBindingsString(c, d, b) : null;
                        return a.g.sb(c, b, d, !1);
                    },
                    getBindingAccessors: function (b, d) {
                        var c = this.getBindingsString(b, d), c = c ? this.parseBindingsString(c, d, b, { valueAccessors: !0 }) : null;
                        return a.g.sb(c, b, d, !0);
                    },
                    getBindingsString: function (b) {
                        switch (b.nodeType) {
                        case 1:
                            return b.getAttribute('data-bind');
                        case 8:
                            return a.e.Fc(b);
                        default:
                            return null;
                        }
                    },
                    parseBindingsString: function (b, d, c, e) {
                        try {
                            var f = this.ec, k = b + (e && e.valueAccessors || ''), h;
                            if (!(h = f[k])) {
                                var l, g = 'with($context){with($data||{}){return{' + a.h.Ea(b, e) + '}}}';
                                l = new Function('$context', '$element', g);
                                h = f[k] = l;
                            }
                            return h(d, c);
                        } catch (m) {
                            throw m.message = 'Unable to parse bindings.\nBindings value: ' + b + '\nMessage: ' + m.message, m;
                        }
                    }
                });
                a.L.instance = new a.L();
            }());
            a.b('bindingProvider', a.L);
            (function () {
                function b(a) {
                    return function () {
                        return a;
                    };
                }
                function d(a) {
                    return a();
                }
                function c(b) {
                    return a.a.pa(a.k.u(b), function (a, c) {
                        return function () {
                            return b()[c];
                        };
                    });
                }
                function e(d, g, e) {
                    return 'function' === typeof d ? c(d.bind(null, g, e)) : a.a.pa(d, b);
                }
                function f(a, b) {
                    return c(this.getBindings.bind(this, a, b));
                }
                function k(b, c, d) {
                    var g, e = a.e.firstChild(c), f = a.L.instance, m = f.preprocessNode;
                    if (m) {
                        for (; g = e;)
                            e = a.e.nextSibling(g), m.call(f, g);
                        e = a.e.firstChild(c);
                    }
                    for (; g = e;)
                        e = a.e.nextSibling(g), h(b, g, d);
                }
                function h(b, c, d) {
                    var e = !0, f = 1 === c.nodeType;
                    f && a.e.Kb(c);
                    if (f && d || a.L.instance.nodeHasBindings(c))
                        e = g(c, null, b, d).shouldBindDescendants;
                    e && !x[a.a.v(c)] && k(b, c, !f);
                }
                function l(b) {
                    var c = [], d = {}, g = [];
                    a.a.A(b, function I(e) {
                        if (!d[e]) {
                            var f = a.getBindingHandler(e);
                            f && (f.after && (g.push(e), a.a.o(f.after, function (c) {
                                if (b[c]) {
                                    if (-1 !== a.a.m(g, c))
                                        throw Error('Cannot combine the following bindings, because they have a cyclic dependency: ' + g.join(', '));
                                    I(c);
                                }
                            }), g.length--), c.push({
                                key: e,
                                Eb: f
                            }));
                            d[e] = !0;
                        }
                    });
                    return c;
                }
                function g(b, c, g, e) {
                    var m = a.a.f.get(b, q);
                    if (!c) {
                        if (m)
                            throw Error('You cannot apply bindings multiple times to the same element.');
                        a.a.f.set(b, q, !0);
                    }
                    !m && e && a.Tb(b, g);
                    var h;
                    if (c && 'function' !== typeof c)
                        h = c;
                    else {
                        var k = a.L.instance, x = k.getBindingAccessors || f, n = a.j(function () {
                                (h = c ? c(g, b) : x.call(k, b, g)) && g.K && g.K();
                                return h;
                            }, null, { q: b });
                        h && n.$() || (n = null);
                    }
                    var u;
                    if (h) {
                        var w = n ? function (a) {
                                return function () {
                                    return d(n()[a]);
                                };
                            } : function (a) {
                                return h[a];
                            }, y = function () {
                                return a.a.pa(n ? n() : h, d);
                            };
                        y.get = function (a) {
                            return h[a] && d(w(a));
                        };
                        y.has = function (a) {
                            return a in h;
                        };
                        e = l(h);
                        a.a.o(e, function (c) {
                            var d = c.Eb.init, e = c.Eb.update, f = c.key;
                            if (8 === b.nodeType && !a.e.R[f])
                                throw Error('The binding \'' + f + '\' cannot be used with virtual elements');
                            try {
                                'function' == typeof d && a.k.u(function () {
                                    var a = d(b, w(f), y, g.$data, g);
                                    if (a && a.controlsDescendantBindings) {
                                        if (u !== p)
                                            throw Error('Multiple bindings (' + u + ' and ' + f + ') are trying to control descendant bindings of the same element. You cannot use these bindings together on the same element.');
                                        u = f;
                                    }
                                }), 'function' == typeof e && a.j(function () {
                                    e(b, w(f), y, g.$data, g);
                                }, null, { q: b });
                            } catch (m) {
                                throw m.message = 'Unable to process binding "' + f + ': ' + h[f] + '"\nMessage: ' + m.message, m;
                            }
                        });
                    }
                    return { shouldBindDescendants: u === p };
                }
                function m(b) {
                    return b && b instanceof a.N ? b : new a.N(b);
                }
                a.d = {};
                var x = {
                    script: !0,
                    textarea: !0
                };
                a.getBindingHandler = function (b) {
                    return a.d[b];
                };
                a.N = function (b, c, d, g) {
                    var e = this, f = 'function' == typeof b && !a.F(b), m, l = a.j(function () {
                            var m = f ? b() : b, h = a.a.c(m);
                            c ? (c.K && c.K(), a.a.extend(e, c), l && (e.K = l)) : (e.$parents = [], e.$root = h, e.ko = a);
                            e.$rawData = m;
                            e.$data = h;
                            d && (e[d] = h);
                            g && g(e, c, h);
                            return e.$data;
                        }, null, {
                            Pa: function () {
                                return m && !a.a.tb(m);
                            },
                            q: !0
                        });
                    l.$() && (e.K = l, l.equalityComparer = null, m = [], l.Zb = function (b) {
                        m.push(b);
                        a.a.C.fa(b, function (b) {
                            a.a.ya(m, b);
                            m.length || (l.p(), e.K = l = p);
                        });
                    });
                };
                a.N.prototype.createChildContext = function (b, c, d) {
                    return new a.N(b, this, c, function (a, b) {
                        a.$parentContext = b;
                        a.$parent = b.$data;
                        a.$parents = (b.$parents || []).slice(0);
                        a.$parents.unshift(a.$parent);
                        d && d(a);
                    });
                };
                a.N.prototype.extend = function (b) {
                    return new a.N(this.K || this.$data, this, null, function (c, d) {
                        c.$rawData = d.$rawData;
                        a.a.extend(c, 'function' == typeof b ? b() : b);
                    });
                };
                var q = a.a.f.I(), n = a.a.f.I();
                a.Tb = function (b, c) {
                    if (2 == arguments.length)
                        a.a.f.set(b, n, c), c.K && c.K.Zb(b);
                    else
                        return a.a.f.get(b, n);
                };
                a.va = function (b, c, d) {
                    1 === b.nodeType && a.e.Kb(b);
                    return g(b, c, m(d), !0);
                };
                a.cc = function (b, c, d) {
                    d = m(d);
                    return a.va(b, e(c, d, b), d);
                };
                a.Ja = function (a, b) {
                    1 !== b.nodeType && 8 !== b.nodeType || k(m(a), b, !0);
                };
                a.ub = function (a, b) {
                    !u && y.jQuery && (u = y.jQuery);
                    if (b && 1 !== b.nodeType && 8 !== b.nodeType)
                        throw Error('ko.applyBindings: first parameter should be your view model; second parameter should be a DOM node');
                    b = b || y.document.body;
                    h(m(a), b, !0);
                };
                a.Oa = function (b) {
                    switch (b.nodeType) {
                    case 1:
                    case 8:
                        var c = a.Tb(b);
                        if (c)
                            return c;
                        if (b.parentNode)
                            return a.Oa(b.parentNode);
                    }
                    return p;
                };
                a.gc = function (b) {
                    return (b = a.Oa(b)) ? b.$data : p;
                };
                a.b('bindingHandlers', a.d);
                a.b('applyBindings', a.ub);
                a.b('applyBindingsToDescendants', a.Ja);
                a.b('applyBindingAccessorsToNode', a.va);
                a.b('applyBindingsToNode', a.cc);
                a.b('contextFor', a.Oa);
                a.b('dataFor', a.gc);
            }());
            (function (b) {
                function d(d, e) {
                    var g = f.hasOwnProperty(d) ? f[d] : b, m;
                    g ? g.U(e) : (g = f[d] = new a.Q(), g.U(e), c(d, function (a, b) {
                        var c = !(!b || !b.synchronous);
                        k[d] = {
                            definition: a,
                            tc: c
                        };
                        delete f[d];
                        m || c ? g.notifySubscribers(a) : setTimeout(function () {
                            g.notifySubscribers(a);
                        }, 0);
                    }), m = !0);
                }
                function c(a, b) {
                    e('getConfig', [a], function (c) {
                        c ? e('loadComponent', [
                            a,
                            c
                        ], function (a) {
                            b(a, c);
                        }) : b(null, null);
                    });
                }
                function e(c, d, g, f) {
                    f || (f = a.g.loaders.slice(0));
                    var k = f.shift();
                    if (k) {
                        var q = k[c];
                        if (q) {
                            var n = !1;
                            if (q.apply(k, d.concat(function (a) {
                                    n ? g(null) : null !== a ? g(a) : e(c, d, g, f);
                                })) !== b && (n = !0, !k.suppressLoaderExceptions))
                                throw Error('Component loaders must supply values by invoking the callback, not by returning values synchronously.');
                        } else
                            e(c, d, g, f);
                    } else
                        g(null);
                }
                var f = {}, k = {};
                a.g = {
                    get: function (c, e) {
                        var g = k.hasOwnProperty(c) ? k[c] : b;
                        g ? g.tc ? a.k.u(function () {
                            e(g.definition);
                        }) : setTimeout(function () {
                            e(g.definition);
                        }, 0) : d(c, e);
                    },
                    zb: function (a) {
                        delete k[a];
                    },
                    ob: e
                };
                a.g.loaders = [];
                a.b('components', a.g);
                a.b('components.get', a.g.get);
                a.b('components.clearCachedDefinition', a.g.zb);
            }());
            (function () {
                function b(b, c, d, e) {
                    function k() {
                        0 === --v && e(h);
                    }
                    var h = {}, v = 2, t = d.template;
                    d = d.viewModel;
                    t ? f(c, t, function (c) {
                        a.g.ob('loadTemplate', [
                            b,
                            c
                        ], function (a) {
                            h.template = a;
                            k();
                        });
                    }) : k();
                    d ? f(c, d, function (c) {
                        a.g.ob('loadViewModel', [
                            b,
                            c
                        ], function (a) {
                            h[l] = a;
                            k();
                        });
                    }) : k();
                }
                function d(a, b, c) {
                    if ('function' === typeof b)
                        c(function (a) {
                            return new b(a);
                        });
                    else if ('function' === typeof b[l])
                        c(b[l]);
                    else if ('instance' in b) {
                        var e = b.instance;
                        c(function () {
                            return e;
                        });
                    } else
                        'viewModel' in b ? d(a, b.viewModel, c) : a('Unknown viewModel value: ' + b);
                }
                function c(b) {
                    switch (a.a.v(b)) {
                    case 'script':
                        return a.a.ca(b.text);
                    case 'textarea':
                        return a.a.ca(b.value);
                    case 'template':
                        if (e(b.content))
                            return a.a.la(b.content.childNodes);
                    }
                    return a.a.la(b.childNodes);
                }
                function e(a) {
                    return y.DocumentFragment ? a instanceof DocumentFragment : a && 11 === a.nodeType;
                }
                function f(a, b, c) {
                    'string' === typeof b.require ? O || y.require ? (O || y.require)([b.require], c) : a('Uses require, but no AMD loader is present') : c(b);
                }
                function k(a) {
                    return function (b) {
                        throw Error('Component \'' + a + '\': ' + b);
                    };
                }
                var h = {};
                a.g.register = function (b, c) {
                    if (!c)
                        throw Error('Invalid configuration for ' + b);
                    if (a.g.Xa(b))
                        throw Error('Component ' + b + ' is already registered');
                    h[b] = c;
                };
                a.g.Xa = function (a) {
                    return a in h;
                };
                a.g.Ec = function (b) {
                    delete h[b];
                    a.g.zb(b);
                };
                a.g.Ab = {
                    getConfig: function (a, b) {
                        b(h.hasOwnProperty(a) ? h[a] : null);
                    },
                    loadComponent: function (a, c, d) {
                        var e = k(a);
                        f(e, c, function (c) {
                            b(a, e, c, d);
                        });
                    },
                    loadTemplate: function (b, d, f) {
                        b = k(b);
                        if ('string' === typeof d)
                            f(a.a.ca(d));
                        else if (d instanceof Array)
                            f(d);
                        else if (e(d))
                            f(a.a.O(d.childNodes));
                        else if (d.element)
                            if (d = d.element, y.HTMLElement ? d instanceof HTMLElement : d && d.tagName && 1 === d.nodeType)
                                f(c(d));
                            else if ('string' === typeof d) {
                                var l = w.getElementById(d);
                                l ? f(c(l)) : b('Cannot find element with ID ' + d);
                            } else
                                b('Unknown element type: ' + d);
                        else
                            b('Unknown template value: ' + d);
                    },
                    loadViewModel: function (a, b, c) {
                        d(k(a), b, c);
                    }
                };
                var l = 'createViewModel';
                a.b('components.register', a.g.register);
                a.b('components.isRegistered', a.g.Xa);
                a.b('components.unregister', a.g.Ec);
                a.b('components.defaultLoader', a.g.Ab);
                a.g.loaders.push(a.g.Ab);
                a.g.$b = h;
            }());
            (function () {
                function b(b, e) {
                    var f = b.getAttribute('params');
                    if (f) {
                        var f = d.parseBindingsString(f, e, b, {
                                valueAccessors: !0,
                                bindingParams: !0
                            }), f = a.a.pa(f, function (d) {
                                return a.w(d, null, { q: b });
                            }), k = a.a.pa(f, function (d) {
                                var e = d.B();
                                return d.$() ? a.w({
                                    read: function () {
                                        return a.a.c(d());
                                    },
                                    write: a.Da(e) && function (a) {
                                        d()(a);
                                    },
                                    q: b
                                }) : e;
                            });
                        k.hasOwnProperty('$raw') || (k.$raw = f);
                        return k;
                    }
                    return { $raw: {} };
                }
                a.g.getComponentNameForNode = function (b) {
                    b = a.a.v(b);
                    return a.g.Xa(b) && b;
                };
                a.g.sb = function (c, d, f, k) {
                    if (1 === d.nodeType) {
                        var h = a.g.getComponentNameForNode(d);
                        if (h) {
                            c = c || {};
                            if (c.component)
                                throw Error('Cannot use the "component" binding on a custom element matching a component');
                            var l = {
                                name: h,
                                params: b(d, f)
                            };
                            c.component = k ? function () {
                                return l;
                            } : l;
                        }
                    }
                    return c;
                };
                var d = new a.L();
                9 > a.a.M && (a.g.register = function (a) {
                    return function (b) {
                        w.createElement(b);
                        return a.apply(this, arguments);
                    };
                }(a.g.register), w.createDocumentFragment = function (b) {
                    return function () {
                        var d = b(), f = a.g.$b, k;
                        for (k in f)
                            f.hasOwnProperty(k) && d.createElement(k);
                        return d;
                    };
                }(w.createDocumentFragment));
            }());
            (function (b) {
                function d(b, c, d) {
                    c = c.template;
                    if (!c)
                        throw Error('Component \'' + b + '\' has no template');
                    b = a.a.la(c);
                    a.e.T(d, b);
                }
                function c(a, b, c, d) {
                    var e = a.createViewModel;
                    return e ? e.call(a, d, {
                        element: b,
                        templateNodes: c
                    }) : d;
                }
                var e = 0;
                a.d.component = {
                    init: function (f, k, h, l, g) {
                        function m() {
                            var a = x && x.dispose;
                            'function' === typeof a && a.call(x);
                            q = null;
                        }
                        var x, q, n = a.a.O(a.e.childNodes(f));
                        a.a.C.fa(f, m);
                        a.w(function () {
                            var l = a.a.c(k()), h, t;
                            'string' === typeof l ? h = l : (h = a.a.c(l.name), t = a.a.c(l.params));
                            if (!h)
                                throw Error('No component name specified');
                            var p = q = ++e;
                            a.g.get(h, function (e) {
                                if (q === p) {
                                    m();
                                    if (!e)
                                        throw Error('Unknown component \'' + h + '\'');
                                    d(h, e, f);
                                    var l = c(e, f, n, t);
                                    e = g.createChildContext(l, b, function (a) {
                                        a.$component = l;
                                        a.$componentTemplateNodes = n;
                                    });
                                    x = l;
                                    a.Ja(e, f);
                                }
                            });
                        }, null, { q: f });
                        return { controlsDescendantBindings: !0 };
                    }
                };
                a.e.R.component = !0;
            }());
            var P = {
                'class': 'className',
                'for': 'htmlFor'
            };
            a.d.attr = {
                update: function (b, d) {
                    var c = a.a.c(d()) || {};
                    a.a.A(c, function (c, d) {
                        d = a.a.c(d);
                        var k = !1 === d || null === d || d === p;
                        k && b.removeAttribute(c);
                        8 >= a.a.M && c in P ? (c = P[c], k ? b.removeAttribute(c) : b[c] = d) : k || b.setAttribute(c, d.toString());
                        'name' === c && a.a.Rb(b, k ? '' : d.toString());
                    });
                }
            };
            (function () {
                a.d.checked = {
                    after: [
                        'value',
                        'attr'
                    ],
                    init: function (b, d, c) {
                        function e() {
                            var e = b.checked, f = x ? k() : e;
                            if (!a.Z.Ca() && (!l || e)) {
                                var h = a.k.u(d);
                                g ? m !== f ? (e && (a.a.ga(h, f, !0), a.a.ga(h, m, !1)), m = f) : a.a.ga(h, f, e) : a.h.ra(h, c, 'checked', f, !0);
                            }
                        }
                        function f() {
                            var c = a.a.c(d());
                            b.checked = g ? 0 <= a.a.m(c, k()) : h ? c : k() === c;
                        }
                        var k = a.Nb(function () {
                                return c.has('checkedValue') ? a.a.c(c.get('checkedValue')) : c.has('value') ? a.a.c(c.get('value')) : b.value;
                            }), h = 'checkbox' == b.type, l = 'radio' == b.type;
                        if (h || l) {
                            var g = h && a.a.c(d()) instanceof Array, m = g ? k() : p, x = l || g;
                            l && !b.name && a.d.uniqueName.init(b, function () {
                                return !0;
                            });
                            a.w(e, null, { q: b });
                            a.a.n(b, 'click', e);
                            a.w(f, null, { q: b });
                        }
                    }
                };
                a.h.V.checked = !0;
                a.d.checkedValue = {
                    update: function (b, d) {
                        b.value = a.a.c(d());
                    }
                };
            }());
            a.d.css = {
                update: function (b, d) {
                    var c = a.a.c(d());
                    null !== c && 'object' == typeof c ? a.a.A(c, function (c, d) {
                        d = a.a.c(d);
                        a.a.Ia(b, c, d);
                    }) : (c = String(c || ''), a.a.Ia(b, b.__ko__cssValue, !1), b.__ko__cssValue = c, a.a.Ia(b, c, !0));
                }
            };
            a.d.enable = {
                update: function (b, d) {
                    var c = a.a.c(d());
                    c && b.disabled ? b.removeAttribute('disabled') : c || b.disabled || (b.disabled = !0);
                }
            };
            a.d.disable = {
                update: function (b, d) {
                    a.d.enable.update(b, function () {
                        return !a.a.c(d());
                    });
                }
            };
            a.d.event = {
                init: function (b, d, c, e, f) {
                    var k = d() || {};
                    a.a.A(k, function (h) {
                        'string' == typeof h && a.a.n(b, h, function (b) {
                            var g, m = d()[h];
                            if (m) {
                                try {
                                    var k = a.a.O(arguments);
                                    e = f.$data;
                                    k.unshift(e);
                                    g = m.apply(e, k);
                                } finally {
                                    !0 !== g && (b.preventDefault ? b.preventDefault() : b.returnValue = !1);
                                }
                                !1 === c.get(h + 'Bubble') && (b.cancelBubble = !0, b.stopPropagation && b.stopPropagation());
                            }
                        });
                    });
                }
            };
            a.d.foreach = {
                Ib: function (b) {
                    return function () {
                        var d = b(), c = a.a.cb(d);
                        if (!c || 'number' == typeof c.length)
                            return {
                                foreach: d,
                                templateEngine: a.P.Va
                            };
                        a.a.c(d);
                        return {
                            foreach: c.data,
                            as: c.as,
                            includeDestroyed: c.includeDestroyed,
                            afterAdd: c.afterAdd,
                            beforeRemove: c.beforeRemove,
                            afterRender: c.afterRender,
                            beforeMove: c.beforeMove,
                            afterMove: c.afterMove,
                            templateEngine: a.P.Va
                        };
                    };
                },
                init: function (b, d) {
                    return a.d.template.init(b, a.d.foreach.Ib(d));
                },
                update: function (b, d, c, e, f) {
                    return a.d.template.update(b, a.d.foreach.Ib(d), c, e, f);
                }
            };
            a.h.ka.foreach = !1;
            a.e.R.foreach = !0;
            a.d.hasfocus = {
                init: function (b, d, c) {
                    function e(e) {
                        b.__ko_hasfocusUpdating = !0;
                        var f = b.ownerDocument;
                        if ('activeElement' in f) {
                            var g;
                            try {
                                g = f.activeElement;
                            } catch (m) {
                                g = f.body;
                            }
                            e = g === b;
                        }
                        f = d();
                        a.h.ra(f, c, 'hasfocus', e, !0);
                        b.__ko_hasfocusLastValue = e;
                        b.__ko_hasfocusUpdating = !1;
                    }
                    var f = e.bind(null, !0), k = e.bind(null, !1);
                    a.a.n(b, 'focus', f);
                    a.a.n(b, 'focusin', f);
                    a.a.n(b, 'blur', k);
                    a.a.n(b, 'focusout', k);
                },
                update: function (b, d) {
                    var c = !!a.a.c(d());
                    b.__ko_hasfocusUpdating || b.__ko_hasfocusLastValue === c || (c ? b.focus() : b.blur(), a.k.u(a.a.qa, null, [
                        b,
                        c ? 'focusin' : 'focusout'
                    ]));
                }
            };
            a.h.V.hasfocus = !0;
            a.d.hasFocus = a.d.hasfocus;
            a.h.V.hasFocus = !0;
            a.d.html = {
                init: function () {
                    return { controlsDescendantBindings: !0 };
                },
                update: function (b, d) {
                    a.a.gb(b, d());
                }
            };
            K('if');
            K('ifnot', !1, !0);
            K('with', !0, !1, function (a, d) {
                return a.createChildContext(d);
            });
            var L = {};
            a.d.options = {
                init: function (b) {
                    if ('select' !== a.a.v(b))
                        throw Error('options binding applies only to SELECT elements');
                    for (; 0 < b.length;)
                        b.remove(0);
                    return { controlsDescendantBindings: !0 };
                },
                update: function (b, d, c) {
                    function e() {
                        return a.a.xa(b.options, function (a) {
                            return a.selected;
                        });
                    }
                    function f(a, b, c) {
                        var d = typeof b;
                        return 'function' == d ? b(a) : 'string' == d ? a[b] : c;
                    }
                    function k(d, e) {
                        if (r && m)
                            a.i.Y(b, a.a.c(c.get('value')), !0);
                        else if (n.length) {
                            var g = 0 <= a.a.m(n, a.i.s(e[0]));
                            a.a.Sb(e[0], g);
                            r && !g && a.k.u(a.a.qa, null, [
                                b,
                                'change'
                            ]);
                        }
                    }
                    var h = b.multiple, l = 0 != b.length && h ? b.scrollTop : null, g = a.a.c(d()), m = c.get('valueAllowUnset') && c.has('value'), x = c.get('optionsIncludeDestroyed');
                    d = {};
                    var q, n = [];
                    m || (h ? n = a.a.Ka(e(), a.i.s) : 0 <= b.selectedIndex && n.push(a.i.s(b.options[b.selectedIndex])));
                    g && ('undefined' == typeof g.length && (g = [g]), q = a.a.xa(g, function (b) {
                        return x || b === p || null === b || !a.a.c(b._destroy);
                    }), c.has('optionsCaption') && (g = a.a.c(c.get('optionsCaption')), null !== g && g !== p && q.unshift(L)));
                    var r = !1;
                    d.beforeRemove = function (a) {
                        b.removeChild(a);
                    };
                    g = k;
                    c.has('optionsAfterRender') && 'function' == typeof c.get('optionsAfterRender') && (g = function (b, d) {
                        k(0, d);
                        a.k.u(c.get('optionsAfterRender'), null, [
                            d[0],
                            b !== L ? b : p
                        ]);
                    });
                    a.a.fb(b, q, function (d, e, g) {
                        g.length && (n = !m && g[0].selected ? [a.i.s(g[0])] : [], r = !0);
                        e = b.ownerDocument.createElement('option');
                        d === L ? (a.a.Ha(e, c.get('optionsCaption')), a.i.Y(e, p)) : (g = f(d, c.get('optionsValue'), d), a.i.Y(e, a.a.c(g)), d = f(d, c.get('optionsText'), g), a.a.Ha(e, d));
                        return [e];
                    }, d, g);
                    a.k.u(function () {
                        m ? a.i.Y(b, a.a.c(c.get('value')), !0) : (h ? n.length && e().length < n.length : n.length && 0 <= b.selectedIndex ? a.i.s(b.options[b.selectedIndex]) !== n[0] : n.length || 0 <= b.selectedIndex) && a.a.qa(b, 'change');
                    });
                    a.a.kc(b);
                    l && 20 < Math.abs(l - b.scrollTop) && (b.scrollTop = l);
                }
            };
            a.d.options.ab = a.a.f.I();
            a.d.selectedOptions = {
                after: [
                    'options',
                    'foreach'
                ],
                init: function (b, d, c) {
                    a.a.n(b, 'change', function () {
                        var e = d(), f = [];
                        a.a.o(b.getElementsByTagName('option'), function (b) {
                            b.selected && f.push(a.i.s(b));
                        });
                        a.h.ra(e, c, 'selectedOptions', f);
                    });
                },
                update: function (b, d) {
                    if ('select' != a.a.v(b))
                        throw Error('values binding applies only to SELECT elements');
                    var c = a.a.c(d());
                    c && 'number' == typeof c.length && a.a.o(b.getElementsByTagName('option'), function (b) {
                        var d = 0 <= a.a.m(c, a.i.s(b));
                        a.a.Sb(b, d);
                    });
                }
            };
            a.h.V.selectedOptions = !0;
            a.d.style = {
                update: function (b, d) {
                    var c = a.a.c(d() || {});
                    a.a.A(c, function (c, d) {
                        d = a.a.c(d);
                        if (null === d || d === p || !1 === d)
                            d = '';
                        b.style[c] = d;
                    });
                }
            };
            a.d.submit = {
                init: function (b, d, c, e, f) {
                    if ('function' != typeof d())
                        throw Error('The value for a submit binding must be a function');
                    a.a.n(b, 'submit', function (a) {
                        var c, e = d();
                        try {
                            c = e.call(f.$data, b);
                        } finally {
                            !0 !== c && (a.preventDefault ? a.preventDefault() : a.returnValue = !1);
                        }
                    });
                }
            };
            a.d.text = {
                init: function () {
                    return { controlsDescendantBindings: !0 };
                },
                update: function (b, d) {
                    a.a.Ha(b, d());
                }
            };
            a.e.R.text = !0;
            (function () {
                if (y && y.navigator)
                    var b = function (a) {
                            if (a)
                                return parseFloat(a[1]);
                        }, d = y.opera && y.opera.version && parseInt(y.opera.version()), c = y.navigator.userAgent, e = b(c.match(/^(?:(?!chrome).)*version\/([^ ]*) safari/i)), f = b(c.match(/Firefox\/([^ ]*)/));
                if (10 > a.a.M)
                    var k = a.a.f.I(), h = a.a.f.I(), l = function (b) {
                            var c = this.activeElement;
                            (c = c && a.a.f.get(c, h)) && c(b);
                        }, g = function (b, c) {
                            var d = b.ownerDocument;
                            a.a.f.get(d, k) || (a.a.f.set(d, k, !0), a.a.n(d, 'selectionchange', l));
                            a.a.f.set(b, h, c);
                        };
                a.d.textInput = {
                    init: function (b, c, l) {
                        function h(c, d) {
                            a.a.n(b, c, d);
                        }
                        function k() {
                            var d = a.a.c(c());
                            if (null === d || d === p)
                                d = '';
                            w !== p && d === w ? setTimeout(k, 4) : b.value !== d && (u = d, b.value = d);
                        }
                        function v() {
                            A || (w = b.value, A = setTimeout(t, 4));
                        }
                        function t() {
                            clearTimeout(A);
                            w = A = p;
                            var d = b.value;
                            u !== d && (u = d, a.h.ra(c(), l, 'textInput', d));
                        }
                        var u = b.value, A, w;
                        10 > a.a.M ? (h('propertychange', function (a) {
                            'value' === a.propertyName && t();
                        }), 8 == a.a.M && (h('keyup', t), h('keydown', t)), 8 <= a.a.M && (g(b, t), h('dragend', v))) : (h('input', t), 5 > e && 'textarea' === a.a.v(b) ? (h('keydown', v), h('paste', v), h('cut', v)) : 11 > d ? h('keydown', v) : 4 > f && (h('DOMAutoComplete', t), h('dragdrop', t), h('drop', t)));
                        h('change', t);
                        a.w(k, null, { q: b });
                    }
                };
                a.h.V.textInput = !0;
                a.d.textinput = {
                    preprocess: function (a, b, c) {
                        c('textInput', a);
                    }
                };
            }());
            a.d.uniqueName = {
                init: function (b, d) {
                    if (d()) {
                        var c = 'ko_unique_' + ++a.d.uniqueName.fc;
                        a.a.Rb(b, c);
                    }
                }
            };
            a.d.uniqueName.fc = 0;
            a.d.value = {
                after: [
                    'options',
                    'foreach'
                ],
                init: function (b, d, c) {
                    if ('input' != b.tagName.toLowerCase() || 'checkbox' != b.type && 'radio' != b.type) {
                        var e = ['change'], f = c.get('valueUpdate'), k = !1, h = null;
                        f && ('string' == typeof f && (f = [f]), a.a.ia(e, f), e = a.a.wb(e));
                        var l = function () {
                            h = null;
                            k = !1;
                            var e = d(), g = a.i.s(b);
                            a.h.ra(e, c, 'value', g);
                        };
                        !a.a.M || 'input' != b.tagName.toLowerCase() || 'text' != b.type || 'off' == b.autocomplete || b.form && 'off' == b.form.autocomplete || -1 != a.a.m(e, 'propertychange') || (a.a.n(b, 'propertychange', function () {
                            k = !0;
                        }), a.a.n(b, 'focus', function () {
                            k = !1;
                        }), a.a.n(b, 'blur', function () {
                            k && l();
                        }));
                        a.a.o(e, function (c) {
                            var d = l;
                            a.a.Dc(c, 'after') && (d = function () {
                                h = a.i.s(b);
                                setTimeout(l, 0);
                            }, c = c.substring(5));
                            a.a.n(b, c, d);
                        });
                        var g = function () {
                            var e = a.a.c(d()), f = a.i.s(b);
                            if (null !== h && e === h)
                                setTimeout(g, 0);
                            else if (e !== f)
                                if ('select' === a.a.v(b)) {
                                    var l = c.get('valueAllowUnset'), f = function () {
                                            a.i.Y(b, e, l);
                                        };
                                    f();
                                    l || e === a.i.s(b) ? setTimeout(f, 0) : a.k.u(a.a.qa, null, [
                                        b,
                                        'change'
                                    ]);
                                } else
                                    a.i.Y(b, e);
                        };
                        a.w(g, null, { q: b });
                    } else
                        a.va(b, { checkedValue: d });
                },
                update: function () {
                }
            };
            a.h.V.value = !0;
            a.d.visible = {
                update: function (b, d) {
                    var c = a.a.c(d()), e = 'none' != b.style.display;
                    c && !e ? b.style.display = '' : !c && e && (b.style.display = 'none');
                }
            };
            (function (b) {
                a.d[b] = {
                    init: function (d, c, e, f, k) {
                        return a.d.event.init.call(this, d, function () {
                            var a = {};
                            a[b] = c();
                            return a;
                        }, e, f, k);
                    }
                };
            }('click'));
            a.J = function () {
            };
            a.J.prototype.renderTemplateSource = function () {
                throw Error('Override renderTemplateSource');
            };
            a.J.prototype.createJavaScriptEvaluatorBlock = function () {
                throw Error('Override createJavaScriptEvaluatorBlock');
            };
            a.J.prototype.makeTemplateSource = function (b, d) {
                if ('string' == typeof b) {
                    d = d || w;
                    var c = d.getElementById(b);
                    if (!c)
                        throw Error('Cannot find template with ID ' + b);
                    return new a.t.l(c);
                }
                if (1 == b.nodeType || 8 == b.nodeType)
                    return new a.t.ha(b);
                throw Error('Unknown template type: ' + b);
            };
            a.J.prototype.renderTemplate = function (a, d, c, e) {
                a = this.makeTemplateSource(a, e);
                return this.renderTemplateSource(a, d, c, e);
            };
            a.J.prototype.isTemplateRewritten = function (a, d) {
                return !1 === this.allowTemplateRewriting ? !0 : this.makeTemplateSource(a, d).data('isRewritten');
            };
            a.J.prototype.rewriteTemplate = function (a, d, c) {
                a = this.makeTemplateSource(a, c);
                d = d(a.text());
                a.text(d);
                a.data('isRewritten', !0);
            };
            a.b('templateEngine', a.J);
            a.kb = function () {
                function b(b, c, d, h) {
                    b = a.h.bb(b);
                    for (var l = a.h.ka, g = 0; g < b.length; g++) {
                        var m = b[g].key;
                        if (l.hasOwnProperty(m)) {
                            var x = l[m];
                            if ('function' === typeof x) {
                                if (m = x(b[g].value))
                                    throw Error(m);
                            } else if (!x)
                                throw Error('This template engine does not support the \'' + m + '\' binding within its templates');
                        }
                    }
                    d = 'ko.__tr_ambtns(function($context,$element){return(function(){return{ ' + a.h.Ea(b, { valueAccessors: !0 }) + ' } })()},\'' + d.toLowerCase() + '\')';
                    return h.createJavaScriptEvaluatorBlock(d) + c;
                }
                var d = /(<([a-z]+\d*)(?:\s+(?!data-bind\s*=\s*)[a-z0-9\-]+(?:=(?:\"[^\"]*\"|\'[^\']*\'|[^>]*))?)*\s+)data-bind\s*=\s*(["'])([\s\S]*?)\3/gi, c = /\x3c!--\s*ko\b\s*([\s\S]*?)\s*--\x3e/g;
                return {
                    lc: function (b, c, d) {
                        c.isTemplateRewritten(b, d) || c.rewriteTemplate(b, function (b) {
                            return a.kb.xc(b, c);
                        }, d);
                    },
                    xc: function (a, f) {
                        return a.replace(d, function (a, c, d, e, m) {
                            return b(m, c, d, f);
                        }).replace(c, function (a, c) {
                            return b(c, '<!-- ko -->', '#comment', f);
                        });
                    },
                    dc: function (b, c) {
                        return a.H.$a(function (d, h) {
                            var l = d.nextSibling;
                            l && l.nodeName.toLowerCase() === c && a.va(l, b, h);
                        });
                    }
                };
            }();
            a.b('__tr_ambtns', a.kb.dc);
            (function () {
                a.t = {};
                a.t.l = function (a) {
                    this.l = a;
                };
                a.t.l.prototype.text = function () {
                    var b = a.a.v(this.l), b = 'script' === b ? 'text' : 'textarea' === b ? 'value' : 'innerHTML';
                    if (0 == arguments.length)
                        return this.l[b];
                    var d = arguments[0];
                    'innerHTML' === b ? a.a.gb(this.l, d) : this.l[b] = d;
                };
                var b = a.a.f.I() + '_';
                a.t.l.prototype.data = function (c) {
                    if (1 === arguments.length)
                        return a.a.f.get(this.l, b + c);
                    a.a.f.set(this.l, b + c, arguments[1]);
                };
                var d = a.a.f.I();
                a.t.ha = function (a) {
                    this.l = a;
                };
                a.t.ha.prototype = new a.t.l();
                a.t.ha.prototype.text = function () {
                    if (0 == arguments.length) {
                        var b = a.a.f.get(this.l, d) || {};
                        b.lb === p && b.Na && (b.lb = b.Na.innerHTML);
                        return b.lb;
                    }
                    a.a.f.set(this.l, d, { lb: arguments[0] });
                };
                a.t.l.prototype.nodes = function () {
                    if (0 == arguments.length)
                        return (a.a.f.get(this.l, d) || {}).Na;
                    a.a.f.set(this.l, d, { Na: arguments[0] });
                };
                a.b('templateSources', a.t);
                a.b('templateSources.domElement', a.t.l);
                a.b('templateSources.anonymousTemplate', a.t.ha);
            }());
            (function () {
                function b(b, c, d) {
                    var e;
                    for (c = a.e.nextSibling(c); b && (e = b) !== c;)
                        b = a.e.nextSibling(e), d(e, b);
                }
                function d(c, d) {
                    if (c.length) {
                        var e = c[0], f = c[c.length - 1], h = e.parentNode, k = a.L.instance, r = k.preprocessNode;
                        if (r) {
                            b(e, f, function (a, b) {
                                var c = a.previousSibling, d = r.call(k, a);
                                d && (a === e && (e = d[0] || b), a === f && (f = d[d.length - 1] || c));
                            });
                            c.length = 0;
                            if (!e)
                                return;
                            e === f ? c.push(e) : (c.push(e, f), a.a.na(c, h));
                        }
                        b(e, f, function (b) {
                            1 !== b.nodeType && 8 !== b.nodeType || a.ub(d, b);
                        });
                        b(e, f, function (b) {
                            1 !== b.nodeType && 8 !== b.nodeType || a.H.Xb(b, [d]);
                        });
                        a.a.na(c, h);
                    }
                }
                function c(a) {
                    return a.nodeType ? a : 0 < a.length ? a[0] : null;
                }
                function e(b, e, f, h, q) {
                    q = q || {};
                    var n = (b && c(b) || f || {}).ownerDocument, r = q.templateEngine || k;
                    a.kb.lc(f, r, n);
                    f = r.renderTemplate(f, h, q, n);
                    if ('number' != typeof f.length || 0 < f.length && 'number' != typeof f[0].nodeType)
                        throw Error('Template engine must return an array of DOM nodes');
                    n = !1;
                    switch (e) {
                    case 'replaceChildren':
                        a.e.T(b, f);
                        n = !0;
                        break;
                    case 'replaceNode':
                        a.a.Qb(b, f);
                        n = !0;
                        break;
                    case 'ignoreTargetNode':
                        break;
                    default:
                        throw Error('Unknown renderMode: ' + e);
                    }
                    n && (d(f, h), q.afterRender && a.k.u(q.afterRender, null, [
                        f,
                        h.$data
                    ]));
                    return f;
                }
                function f(b, c, d) {
                    return a.F(b) ? b() : 'function' === typeof b ? b(c, d) : b;
                }
                var k;
                a.hb = function (b) {
                    if (b != p && !(b instanceof a.J))
                        throw Error('templateEngine must inherit from ko.templateEngine');
                    k = b;
                };
                a.eb = function (b, d, h, x, q) {
                    h = h || {};
                    if ((h.templateEngine || k) == p)
                        throw Error('Set a template engine before calling renderTemplate');
                    q = q || 'replaceChildren';
                    if (x) {
                        var n = c(x);
                        return a.j(function () {
                            var k = d && d instanceof a.N ? d : new a.N(a.a.c(d)), p = f(b, k.$data, k), k = e(x, q, p, k, h);
                            'replaceNode' == q && (x = k, n = c(x));
                        }, null, {
                            Pa: function () {
                                return !n || !a.a.Qa(n);
                            },
                            q: n && 'replaceNode' == q ? n.parentNode : n
                        });
                    }
                    return a.H.$a(function (c) {
                        a.eb(b, d, h, c, 'replaceNode');
                    });
                };
                a.Cc = function (b, c, h, k, q) {
                    function n(a, b) {
                        d(b, v);
                        h.afterRender && h.afterRender(b, a);
                        v = null;
                    }
                    function r(a, c) {
                        v = q.createChildContext(a, h.as, function (a) {
                            a.$index = c;
                        });
                        var d = f(b, a, v);
                        return e(null, 'ignoreTargetNode', d, v, h);
                    }
                    var v;
                    return a.j(function () {
                        var b = a.a.c(c) || [];
                        'undefined' == typeof b.length && (b = [b]);
                        b = a.a.xa(b, function (b) {
                            return h.includeDestroyed || b === p || null === b || !a.a.c(b._destroy);
                        });
                        a.k.u(a.a.fb, null, [
                            k,
                            b,
                            r,
                            h,
                            n
                        ]);
                    }, null, { q: k });
                };
                var h = a.a.f.I();
                a.d.template = {
                    init: function (b, c) {
                        var d = a.a.c(c());
                        if ('string' == typeof d || d.name)
                            a.e.ma(b);
                        else {
                            if ('nodes' in d) {
                                if (d = d.nodes || [], a.F(d))
                                    throw Error('The "nodes" option must be a plain, non-observable array.');
                            } else
                                d = a.e.childNodes(b);
                            d = a.a.Jb(d);
                            new a.t.ha(b).nodes(d);
                        }
                        return { controlsDescendantBindings: !0 };
                    },
                    update: function (b, c, d, e, f) {
                        var k = c(), r;
                        c = a.a.c(k);
                        d = !0;
                        e = null;
                        'string' == typeof c ? c = {} : (k = c.name, 'if' in c && (d = a.a.c(c['if'])), d && 'ifnot' in c && (d = !a.a.c(c.ifnot)), r = a.a.c(c.data));
                        'foreach' in c ? e = a.Cc(k || b, d && c.foreach || [], c, b, f) : d ? (f = 'data' in c ? f.createChildContext(r, c.as) : f, e = a.eb(k || b, f, c, b)) : a.e.ma(b);
                        f = e;
                        (r = a.a.f.get(b, h)) && 'function' == typeof r.p && r.p();
                        a.a.f.set(b, h, f && f.$() ? f : p);
                    }
                };
                a.h.ka.template = function (b) {
                    b = a.h.bb(b);
                    return 1 == b.length && b[0].unknown || a.h.vc(b, 'name') ? null : 'This template engine does not support anonymous templates nested within its templates';
                };
                a.e.R.template = !0;
            }());
            a.b('setTemplateEngine', a.hb);
            a.b('renderTemplate', a.eb);
            a.a.Cb = function (a, d, c) {
                if (a.length && d.length) {
                    var e, f, k, h, l;
                    for (e = f = 0; (!c || e < c) && (h = a[f]); ++f) {
                        for (k = 0; l = d[k]; ++k)
                            if (h.value === l.value) {
                                h.moved = l.index;
                                l.moved = h.index;
                                d.splice(k, 1);
                                e = k = 0;
                                break;
                            }
                        e += k;
                    }
                }
            };
            a.a.Ma = function () {
                function b(b, c, e, f, k) {
                    var h = Math.min, l = Math.max, g = [], m, p = b.length, q, n = c.length, r = n - p || 1, v = p + n + 1, t, u, w;
                    for (m = 0; m <= p; m++)
                        for (u = t, g.push(t = []), w = h(n, m + r), q = l(0, m - 1); q <= w; q++)
                            t[q] = q ? m ? b[m - 1] === c[q - 1] ? u[q - 1] : h(u[q] || v, t[q - 1] || v) + 1 : q + 1 : m + 1;
                    h = [];
                    l = [];
                    r = [];
                    m = p;
                    for (q = n; m || q;)
                        n = g[m][q] - 1, q && n === g[m][q - 1] ? l.push(h[h.length] = {
                            status: e,
                            value: c[--q],
                            index: q
                        }) : m && n === g[m - 1][q] ? r.push(h[h.length] = {
                            status: f,
                            value: b[--m],
                            index: m
                        }) : (--q, --m, k.sparse || h.push({
                            status: 'retained',
                            value: c[q]
                        }));
                    a.a.Cb(l, r, 10 * p);
                    return h.reverse();
                }
                return function (a, c, e) {
                    e = 'boolean' === typeof e ? { dontLimitMoves: e } : e || {};
                    a = a || [];
                    c = c || [];
                    return a.length <= c.length ? b(a, c, 'added', 'deleted', e) : b(c, a, 'deleted', 'added', e);
                };
            }();
            a.b('utils.compareArrays', a.a.Ma);
            (function () {
                function b(b, d, f, k, h) {
                    var l = [], g = a.j(function () {
                            var g = d(f, h, a.a.na(l, b)) || [];
                            0 < l.length && (a.a.Qb(l, g), k && a.k.u(k, null, [
                                f,
                                g,
                                h
                            ]));
                            l.length = 0;
                            a.a.ia(l, g);
                        }, null, {
                            q: b,
                            Pa: function () {
                                return !a.a.tb(l);
                            }
                        });
                    return {
                        aa: l,
                        j: g.$() ? g : p
                    };
                }
                var d = a.a.f.I();
                a.a.fb = function (c, e, f, k, h) {
                    function l(b, d) {
                        s = u[d];
                        t !== d && (z[b] = s);
                        s.Ua(t++);
                        a.a.na(s.aa, c);
                        r.push(s);
                        y.push(s);
                    }
                    function g(b, c) {
                        if (b)
                            for (var d = 0, e = c.length; d < e; d++)
                                c[d] && a.a.o(c[d].aa, function (a) {
                                    b(a, d, c[d].wa);
                                });
                    }
                    e = e || [];
                    k = k || {};
                    var m = a.a.f.get(c, d) === p, u = a.a.f.get(c, d) || [], q = a.a.Ka(u, function (a) {
                            return a.wa;
                        }), n = a.a.Ma(q, e, k.dontLimitMoves), r = [], v = 0, t = 0, w = [], y = [];
                    e = [];
                    for (var z = [], q = [], s, C = 0, D, E; D = n[C]; C++)
                        switch (E = D.moved, D.status) {
                        case 'deleted':
                            E === p && (s = u[v], s.j && s.j.p(), w.push.apply(w, a.a.na(s.aa, c)), k.beforeRemove && (e[C] = s, y.push(s)));
                            v++;
                            break;
                        case 'retained':
                            l(C, v++);
                            break;
                        case 'added':
                            E !== p ? l(C, E) : (s = {
                                wa: D.value,
                                Ua: a.r(t++)
                            }, r.push(s), y.push(s), m || (q[C] = s));
                        }
                    g(k.beforeMove, z);
                    a.a.o(w, k.beforeRemove ? a.S : a.removeNode);
                    for (var C = 0, m = a.e.firstChild(c), H; s = y[C]; C++) {
                        s.aa || a.a.extend(s, b(c, f, s.wa, h, s.Ua));
                        for (v = 0; n = s.aa[v]; m = n.nextSibling, H = n, v++)
                            n !== m && a.e.Fb(c, n, H);
                        !s.rc && h && (h(s.wa, s.aa, s.Ua), s.rc = !0);
                    }
                    g(k.beforeRemove, e);
                    g(k.afterMove, z);
                    g(k.afterAdd, q);
                    a.a.f.set(c, d, r);
                };
            }());
            a.b('utils.setDomNodeChildrenFromArrayMapping', a.a.fb);
            a.P = function () {
                this.allowTemplateRewriting = !1;
            };
            a.P.prototype = new a.J();
            a.P.prototype.renderTemplateSource = function (b, d, c, e) {
                if (d = (9 > a.a.M ? 0 : b.nodes) ? b.nodes() : null)
                    return a.a.O(d.cloneNode(!0).childNodes);
                b = b.text();
                return a.a.ca(b, e);
            };
            a.P.Va = new a.P();
            a.hb(a.P.Va);
            a.b('nativeTemplateEngine', a.P);
            (function () {
                a.Ya = function () {
                    var a = this.uc = function () {
                        if (!u || !u.tmpl)
                            return 0;
                        try {
                            if (0 <= u.tmpl.tag.tmpl.open.toString().indexOf('__'))
                                return 2;
                        } catch (a) {
                        }
                        return 1;
                    }();
                    this.renderTemplateSource = function (b, e, f, k) {
                        k = k || w;
                        f = f || {};
                        if (2 > a)
                            throw Error('Your version of jQuery.tmpl is too old. Please upgrade to jQuery.tmpl 1.0.0pre or later.');
                        var h = b.data('precompiled');
                        h || (h = b.text() || '', h = u.template(null, '{{ko_with $item.koBindingContext}}' + h + '{{/ko_with}}'), b.data('precompiled', h));
                        b = [e.$data];
                        e = u.extend({ koBindingContext: e }, f.templateOptions);
                        e = u.tmpl(h, b, e);
                        e.appendTo(k.createElement('div'));
                        u.fragments = {};
                        return e;
                    };
                    this.createJavaScriptEvaluatorBlock = function (a) {
                        return '{{ko_code ((function() { return ' + a + ' })()) }}';
                    };
                    this.addTemplate = function (a, b) {
                        w.write('<script type=\'text/html\' id=\'' + a + '\'>' + b + '</script>');
                    };
                    0 < a && (u.tmpl.tag.ko_code = { open: '__.push($1 || \'\');' }, u.tmpl.tag.ko_with = {
                        open: 'with($1) {',
                        close: '} '
                    });
                };
                a.Ya.prototype = new a.J();
                var b = new a.Ya();
                0 < b.uc && a.hb(b);
                a.b('jqueryTmplTemplateEngine', a.Ya);
            }());
        }));
    }());
}());
'use strict';
define('createFragmentFromTemplate', [], function () {
    var createFragmentFromTemplate = function (htmlString) {
        var holder = document.createElement('div');
        holder.innerHTML = htmlString;
        var fragment = document.createDocumentFragment();
        while (holder.firstChild) {
            fragment.appendChild(holder.firstChild);
        }
        return fragment;
    };
    return createFragmentFromTemplate;
});
'use strict';
define('loadView', [
    'Knockout',
    'createFragmentFromTemplate'
], function (Knockout, createFragmentFromTemplate) {
    var loadView = function (htmlString, container, viewModel) {
        container = Cesium.getElement(container);
        var fragment = createFragmentFromTemplate(htmlString);
        var nodes = [];
        var i;
        for (i = 0; i < fragment.childNodes.length; ++i) {
            nodes.push(fragment.childNodes[i]);
        }
        container.appendChild(fragment);
        for (i = 0; i < nodes.length; ++i) {
            var node = nodes[i];
            if (node.nodeType === 1 || node.nodeType === 8) {
                Knockout.applyBindings(viewModel, node);
            }
        }
        return nodes;
    };
    return loadView;
});
'use strict';
define('inherit', [], function () {
    var inherit = function (base, derived) {
        function F() {
        }
        F.prototype = base.prototype;
        derived.prototype = new F();
        derived.prototype.constructor = derived;
    };
    return inherit;
});
!function (a, b) {
    'use strict';
    function c(a, b) {
        if (!a || 'object' != typeof a)
            throw new Error('When calling ko.track, you must pass an object as the first parameter.');
        var c;
        return i(b) ? (b.deep = b.deep || !1, b.fields = b.fields || Object.getOwnPropertyNames(a), b.lazy = b.lazy || !1, h(a, b.fields, b)) : (c = b || Object.getOwnPropertyNames(a), h(a, c, {})), a;
    }
    function d(a) {
        return a.name ? a.name : (a.toString().trim().match(A) || [])[1];
    }
    function e(a) {
        return a && 'object' == typeof a && 'Object' === d(a.constructor);
    }
    function f(a, c, d) {
        var e = w.isObservable(a), f = !e && Array.isArray(a), g = e ? a : f ? w.observableArray(a) : w.observable(a);
        return d[c] = function () {
            return g;
        }, (f || e && 'push' in g) && m(w, g), {
            configurable: !0,
            enumerable: !0,
            get: g,
            set: w.isWriteableObservable(g) ? g : b
        };
    }
    function g(a, b, c) {
        function d(a, b) {
            return e ? b ? e(a) : e : Array.isArray(a) ? (e = w.observableArray(a), m(w, e), e) : e = w.observable(a);
        }
        if (w.isObservable(a))
            return f(a, b, c);
        var e;
        return c[b] = function () {
            return d(a);
        }, {
            configurable: !0,
            enumerable: !0,
            get: function () {
                return d(a)();
            },
            set: function (a) {
                d(a, !0);
            }
        };
    }
    function h(a, b, c) {
        if (b.length) {
            var d = j(a, !0), i = {};
            b.forEach(function (b) {
                if (!(b in d) && Object.getOwnPropertyDescriptor(a, b).configurable !== !1) {
                    var j = a[b];
                    i[b] = (c.lazy ? g : f)(j, b, d), c.deep && e(j) && h(j, Object.keys(j), c);
                }
            }), Object.defineProperties(a, i);
        }
    }
    function i(a) {
        return !!a && 'object' == typeof a && a.constructor === Object;
    }
    function j(a, b) {
        x || (x = z());
        var c = x.get(a);
        return !c && b && (c = {}, x.set(a, c)), c;
    }
    function k(a, b) {
        if (x)
            if (1 === arguments.length)
                x['delete'](a);
            else {
                var c = j(a, !1);
                c && b.forEach(function (a) {
                    delete c[a];
                });
            }
    }
    function l(a, b, d) {
        var e = this, f = {
                owner: a,
                deferEvaluation: !0
            };
        if ('function' == typeof d)
            f.read = d;
        else {
            if ('value' in d)
                throw new Error('For ko.defineProperty, you must not specify a "value" for the property. You must provide a "get" function.');
            if ('function' != typeof d.get)
                throw new Error('For ko.defineProperty, the third parameter must be either an evaluator function, or an options object containing a function called "get".');
            f.read = d.get, f.write = d.set;
        }
        return a[b] = e.computed(f), c.call(e, a, [b]), a;
    }
    function m(a, b) {
        var c = null;
        a.computed(function () {
            c && (c.dispose(), c = null);
            var d = b();
            d instanceof Array && (c = n(a, b, d));
        });
    }
    function n(a, b, c) {
        var d = o(a, c);
        return d.subscribe(b);
    }
    function o(a, b) {
        y || (y = z());
        var c = y.get(b);
        if (!c) {
            c = new a.subscribable(), y.set(b, c);
            var d = {};
            p(b, c, d), q(a, b, c, d);
        }
        return c;
    }
    function p(a, b, c) {
        [
            'pop',
            'push',
            'reverse',
            'shift',
            'sort',
            'splice',
            'unshift'
        ].forEach(function (d) {
            var e = a[d];
            a[d] = function () {
                var a = e.apply(this, arguments);
                return c.pause !== !0 && b.notifySubscribers(this), a;
            };
        });
    }
    function q(a, b, c, d) {
        [
            'remove',
            'removeAll',
            'destroy',
            'destroyAll',
            'replace'
        ].forEach(function (e) {
            Object.defineProperty(b, e, {
                enumerable: !1,
                value: function () {
                    var f;
                    d.pause = !0;
                    try {
                        f = a.observableArray.fn[e].apply(a.observableArray(b), arguments);
                    } finally {
                        d.pause = !1;
                    }
                    return c.notifySubscribers(b), f;
                }
            });
        });
    }
    function r(a, b) {
        if (!a || 'object' != typeof a)
            return null;
        var c = j(a, !1);
        return c && b in c ? c[b]() : null;
    }
    function s(a, b) {
        if (!a || 'object' != typeof a)
            return !1;
        var c = j(a, !1);
        return !!c && b in c;
    }
    function t(a, b) {
        var c = r(a, b);
        c && c.valueHasMutated();
    }
    function u(a) {
        a.track = c, a.untrack = k, a.getObservable = r, a.valueHasMutated = t, a.defineProperty = l, a.es5 = {
            getAllObservablesForObject: j,
            notifyWhenPresentOrFutureArrayValuesMutate: m,
            isTracked: s
        };
    }
    function v() {
        if ('object' == typeof exports && 'object' == typeof module) {
            w = require('Knockout');
            var b = require('../lib/weakmap');
            u(w), z = function () {
                return new b();
            }, module.exports = w;
        } else
            'function' == typeof define && define.amd ? define('knockoutes5', ['Knockout'], function (b) {
                return w = b, u(b), z = function () {
                    return new a.WeakMap();
                }, b;
            }) : 'ko' in a && (w = a.ko, u(a.ko), z = function () {
                return new a.WeakMap();
            });
    }
    var w, x, y, z, A = /^function\s*([^\s(]+)/;
    v();
}(this), void function (a, b, c) {
    function d(a, b, c) {
        return 'function' == typeof b && (c = b, b = e(c).replace(/_$/, '')), j(a, b, {
            configurable: !0,
            writable: !0,
            value: c
        });
    }
    function e(a) {
        return 'function' != typeof a ? '' : '_name' in a ? a._name : 'name' in a ? a.name : k.call(a).match(n)[1];
    }
    function f(a, b) {
        return b._name = a, b;
    }
    function g(a) {
        function b(b, e) {
            return e || 2 === arguments.length ? d.set(b, e) : (e = d.get(b), e === c && (e = a(b), d.set(b, e))), e;
        }
        var d = new p();
        return a || (a = q), b;
    }
    var h = Object.getOwnPropertyNames, i = 'object' == typeof window ? Object.getOwnPropertyNames(window) : [], j = Object.defineProperty, k = Function.prototype.toString, l = Object.create, m = Object.prototype.hasOwnProperty, n = /^\n?function\s?(\w*)?_?\(/, o = function () {
            function a() {
                var a = g(), c = {};
                this.unlock = function (d) {
                    var e = n(d);
                    if (m.call(e, a))
                        return e[a](c);
                    var f = l(null, b);
                    return j(e, a, {
                        value: function (a) {
                            return a === c ? f : void 0;
                        }
                    }), f;
                };
            }
            var b = {
                    value: {
                        writable: !0,
                        value: c
                    }
                }, e = l(null), g = function () {
                    var a = Math.random().toString(36).slice(2);
                    return a in e ? g() : e[a] = a;
                }, k = g(), n = function (a) {
                    if (m.call(a, k))
                        return a[k];
                    if (!Object.isExtensible(a))
                        throw new TypeError('Object must be extensible');
                    var b = l(null);
                    return j(a, k, { value: b }), b;
                };
            return d(Object, f('getOwnPropertyNames', function (a) {
                var b, c = Object(a);
                if ('[object Window]' === c.toString())
                    try {
                        b = h(a);
                    } catch (d) {
                        b = i;
                    }
                else
                    b = h(a);
                return m.call(a, k) && b.splice(b.indexOf(k), 1), b;
            })), d(a.prototype, f('get', function (a) {
                return this.unlock(a).value;
            })), d(a.prototype, f('set', function (a, b) {
                this.unlock(a).value = b;
            })), a;
        }(), p = function (g) {
            function h(b) {
                return this === a || null == this || this === h.prototype ? new h(b) : (p(this, new o()), void r(this, b));
            }
            function i(a) {
                n(a);
                var d = q(this).get(a);
                return d === b ? c : d;
            }
            function j(a, d) {
                n(a), q(this).set(a, d === c ? b : d);
            }
            function k(a) {
                return n(a), q(this).get(a) !== c;
            }
            function l(a) {
                n(a);
                var b = q(this), d = b.get(a) !== c;
                return b.set(a, c), d;
            }
            function m() {
                return q(this), '[object WeakMap]';
            }
            var n = function (a) {
                    if (null == a || 'object' != typeof a && 'function' != typeof a)
                        throw new TypeError('Invalid WeakMap key');
                }, p = function (a, b) {
                    var c = g.unlock(a);
                    if (c.value)
                        throw new TypeError('Object is already a WeakMap');
                    c.value = b;
                }, q = function (a) {
                    var b = g.unlock(a).value;
                    if (!b)
                        throw new TypeError('WeakMap is not generic');
                    return b;
                }, r = function (a, b) {
                    null !== b && 'object' == typeof b && 'function' == typeof b.forEach && b.forEach(function (c, d) {
                        c instanceof Array && 2 === c.length && j.call(a, b[d][0], b[d][1]);
                    });
                };
            i._name = 'get', j._name = 'set', k._name = 'has', m._name = 'toString';
            var s = ('' + Object).split('Object'), t = f('toString', function () {
                    return s[0] + e(this) + s[1];
                });
            d(t, t);
            var u = { __proto__: [] } instanceof Array ? function (a) {
                a.__proto__ = t;
            } : function (a) {
                d(a, t);
            };
            return u(h), [
                m,
                i,
                j,
                k,
                l
            ].forEach(function (a) {
                d(h.prototype, a), u(a);
            }), h;
        }(new o()), q = Object.create ? function () {
            return Object.create(null);
        } : function () {
            return {};
        };
    'undefined' != typeof module ? module.exports = p : 'undefined' != typeof exports ? exports.WeakMap = p : 'WeakMap' in a || (a.WeakMap = p), p.createStorage = g, a.WeakMap && (a.WeakMap.createStorage = g);
}(function () {
    return this;
}());
'use strict';
define('UserInterfaceControl', [
    'Knockout',
    'knockoutes5'
], function (Knockout, knockoutes5) {
    var UserInterfaceControl = function (terria) {
        if (!Cesium.defined(terria)) {
            throw new Cesium.DeveloperError('terria is required');
        }
        this._terria = terria;
        this.name = 'Unnamed Control';
        this.text = undefined;
        this.svgIcon = undefined;
        this.svgHeight = undefined;
        this.svgWidth = undefined;
        this.cssClass = undefined;
        this.isActive = false;
        Knockout.track(this, [
            'name',
            'svgIcon',
            'svgHeight',
            'svgWidth',
            'cssClass',
            'isActive'
        ]);
    };
    Cesium.defineProperties(UserInterfaceControl.prototype, {
        terria: {
            get: function () {
                return this._terria;
            }
        },
        hasText: {
            get: function () {
                return Cesium.defined(this.text) && typeof this.text === 'string';
            }
        }
    });
    UserInterfaceControl.prototype.activate = function () {
        throw new DeveloperError('activate must be implemented in the derived class.');
    };
    return UserInterfaceControl;
});
'use strict';
define('NavigationControl', [
    'inherit',
    'UserInterfaceControl'
], function (inherit, UserInterfaceControl) {
    var NavigationControl = function (terria) {
        UserInterfaceControl.call(this, terria);
    };
    inherit(UserInterfaceControl, NavigationControl);
    NavigationControl.prototype.flyToPosition = function (scene, position, durationMilliseconds) {
        var camera = scene.camera;
        var startPosition = camera.position;
        var endPosition = position;
        durationMilliseconds = defaultValue(durationMilliseconds, 200);
        var controller = scene.screenSpaceCameraController;
        controller.enableInputs = false;
        scene.tweens.add({
            duration: durationMilliseconds / 1000,
            easingFunction: Cesium.Tween.Easing.Sinusoidal.InOut,
            startObject: { time: 0 },
            stopObject: { time: 1 },
            update: function (value) {
                if (scene.isDestroyed()) {
                    return;
                }
                scene.camera.position.x = Cesium.CesiumMath.lerp(startPosition.x, endPosition.x, value.time);
                scene.camera.position.y = Cesium.CesiumMath.lerp(startPosition.y, endPosition.y, value.time);
                scene.camera.position.z = Cesium.CesiumMath.lerp(startPosition.z, endPosition.z, value.time);
            },
            complete: function () {
                if (controller.isDestroyed()) {
                    return;
                }
                controller.enableInputs = true;
            },
            cancel: function () {
                if (controller.isDestroyed()) {
                    return;
                }
                controller.enableInputs = true;
            }
        });
    };
    NavigationControl.prototype.getCameraFocus = function (scene) {
        var ray = new Cesium.Ray(scene.camera.positionWC, scene.camera.directionWC);
        var intersections = Cesium.IntersectionTests.rayEllipsoid(ray, Cesium.Ellipsoid.WGS84);
        if (Cesium.defined(intersections)) {
            return Cesium.Ray.getPoint(ray, intersections.start);
        } else {
            return Cesium.IntersectionTests.grazingAltitudeLocation(ray, Cesium.Ellipsoid.WGS84);
        }
    };
    return NavigationControl;
});
define('svgReset', [], function () {
    return 'M 7.5,0 C 3.375,0 0,3.375 0,7.5 0,11.625 3.375,15 7.5,15 c 3.46875,0 6.375,-2.4375 7.21875,-5.625 l -1.96875,0 C 12,11.53125 9.9375,13.125 7.5,13.125 4.40625,13.125 1.875,10.59375 1.875,7.5 1.875,4.40625 4.40625,1.875 7.5,1.875 c 1.59375,0 2.90625,0.65625 3.9375,1.6875 l -3,3 6.5625,0 L 15,0 12.75,2.25 C 11.4375,0.84375 9.5625,0 7.5,0 z';
});
'use strict';
define('ResetViewNavigationControl', [
    'inherit',
    'NavigationControl',
    'svgReset'
], function (inherit, NavigationControl, svgReset) {
    var ResetViewNavigationControl = function (terria) {
        NavigationControl.call(this, terria);
        this.name = 'Reset View';
        this.svgIcon = svgReset;
        this.svgHeight = 15;
        this.svgWidth = 15;
        this.cssClass = 'navigation-control-icon-reset';
    };
    inherit(NavigationControl, ResetViewNavigationControl);
    ResetViewNavigationControl.prototype.resetView = function () {
        this.isActive = true;
        this.terria.scene.camera.flyTo({
            'destination': this.terria.homeView.rectangle,
            'duration': 1
        });
        this.isActive = false;
    };
    ResetViewNavigationControl.prototype.activate = function () {
        this.resetView();
    };
    return ResetViewNavigationControl;
});
'use strict';
define('ZoomInNavigationControl', [
    'inherit',
    'NavigationControl'
], function (inherit, NavigationControl) {
    var ZoomInNavigationControl = function (terria) {
        NavigationControl.call(this, terria);
        this.name = 'Zoom In';
        this.text = '+';
        this.cssClass = 'navigation-control-icon-zoom-in';
    };
    inherit(NavigationControl, ZoomInNavigationControl);
    var cartesian3Scratch = new Cesium.Cartesian3();
    ZoomInNavigationControl.prototype.zoomIn = function () {
        this.isActive = true;
        if (Cesium.defined(this.terria.leaflet)) {
            this.terria.leaflet.map.zoomIn(1);
        }
        if (Cesium.defined(this.terria)) {
            var scene = this.terria.scene;
            var camera = scene.camera;
            var focus = this.getCameraFocus(scene);
            var direction = Cesium.Cartesian3.subtract(focus, camera.position, cartesian3Scratch);
            var movementVector = Cesium.Cartesian3.multiplyByScalar(direction, 2 / 3, cartesian3Scratch);
            var endPosition = Cesium.Cartesian3.add(camera.position, movementVector, cartesian3Scratch);
            this.terria.scene.camera.flyTo({
                'destination': endPosition,
                'duration': 1
            });
        }
        this.isActive = false;
    };
    ZoomInNavigationControl.prototype.activate = function () {
        this.zoomIn();
    };
    return ZoomInNavigationControl;
});
'use strict';
define('ZoomOutNavigationControl', [
    'inherit',
    'NavigationControl'
], function (inherit, NavigationControl) {
    var ZoomOutNavigationControl = function (terria) {
        NavigationControl.call(this, terria);
        this.name = 'Zoom Out';
        this.text = '\u2013';
        this.cssClass = 'navigation-control-icon-zoom-out';
    };
    inherit(NavigationControl, ZoomOutNavigationControl);
    var cartesian3Scratch = new Cesium.Cartesian3();
    ZoomOutNavigationControl.prototype.zoomOut = function () {
        this.isActive = true;
        if (Cesium.defined(this.terria.leaflet)) {
            this.terria.leaflet.map.zoomOut(1);
        }
        if (Cesium.defined(this.terria)) {
            var scene = this.terria.scene;
            var camera = scene.camera;
            var focus = this.getCameraFocus(scene);
            var direction = Cesium.Cartesian3.subtract(focus, camera.position, cartesian3Scratch);
            var movementVector = Cesium.Cartesian3.multiplyByScalar(direction, -2, cartesian3Scratch);
            var endPosition = Cesium.Cartesian3.add(camera.position, movementVector, cartesian3Scratch);
            this.terria.scene.camera.flyTo({
                'destination': endPosition,
                'duration': 1
            });
        }
        this.isActive = false;
    };
    ZoomOutNavigationControl.prototype.activate = function () {
        this.zoomOut();
    };
    return ZoomOutNavigationControl;
});
define('svgCompassOuterRing', [], function () {
    return 'm 66.5625,0 0,15.15625 3.71875,0 0,-10.40625 5.5,10.40625 4.375,0 0,-15.15625 -3.71875,0 0,10.40625 L 70.9375,0 66.5625,0 z M 72.5,20.21875 c -28.867432,0 -52.28125,23.407738 -52.28125,52.28125 0,28.87351 23.413818,52.3125 52.28125,52.3125 28.86743,0 52.28125,-23.43899 52.28125,-52.3125 0,-28.873512 -23.41382,-52.28125 -52.28125,-52.28125 z m 0,1.75 c 13.842515,0 26.368948,5.558092 35.5,14.5625 l -11.03125,11 0.625,0.625 11.03125,-11 c 8.9199,9.108762 14.4375,21.579143 14.4375,35.34375 0,13.764606 -5.5176,26.22729 -14.4375,35.34375 l -11.03125,-11 -0.625,0.625 11.03125,11 c -9.130866,9.01087 -21.658601,14.59375 -35.5,14.59375 -13.801622,0 -26.321058,-5.53481 -35.4375,-14.5 l 11.125,-11.09375 c 6.277989,6.12179 14.857796,9.90625 24.3125,9.90625 19.241896,0 34.875,-15.629154 34.875,-34.875 0,-19.245847 -15.633104,-34.84375 -34.875,-34.84375 -9.454704,0 -18.034511,3.760884 -24.3125,9.875 L 37.0625,36.4375 C 46.179178,27.478444 58.696991,21.96875 72.5,21.96875 z m -0.875,0.84375 0,13.9375 1.75,0 0,-13.9375 -1.75,0 z M 36.46875,37.0625 47.5625,48.15625 C 41.429794,54.436565 37.65625,63.027539 37.65625,72.5 c 0,9.472461 3.773544,18.055746 9.90625,24.34375 L 36.46875,107.9375 c -8.96721,-9.1247 -14.5,-21.624886 -14.5,-35.4375 0,-13.812615 5.53279,-26.320526 14.5,-35.4375 z M 72.5,39.40625 c 18.297686,0 33.125,14.791695 33.125,33.09375 0,18.302054 -14.827314,33.125 -33.125,33.125 -18.297687,0 -33.09375,-14.822946 -33.09375,-33.125 0,-18.302056 14.796063,-33.09375 33.09375,-33.09375 z M 22.84375,71.625 l 0,1.75 13.96875,0 0,-1.75 -13.96875,0 z m 85.5625,0 0,1.75 14,0 0,-1.75 -14,0 z M 71.75,108.25 l 0,13.9375 1.71875,0 0,-13.9375 -1.71875,0 z';
});
define('svgCompassGyro', [], function () {
    return 'm 72.71875,54.375 c -0.476702,0 -0.908208,0.245402 -1.21875,0.5625 -0.310542,0.317098 -0.551189,0.701933 -0.78125,1.1875 -0.172018,0.363062 -0.319101,0.791709 -0.46875,1.25 -6.91615,1.075544 -12.313231,6.656514 -13,13.625 -0.327516,0.117495 -0.661877,0.244642 -0.9375,0.375 -0.485434,0.22959 -0.901634,0.471239 -1.21875,0.78125 -0.317116,0.310011 -0.5625,0.742111 -0.5625,1.21875 l 0.03125,0 c 0,0.476639 0.245384,0.877489 0.5625,1.1875 0.317116,0.310011 0.702066,0.58291 1.1875,0.8125 0.35554,0.168155 0.771616,0.32165 1.21875,0.46875 1.370803,6.10004 6.420817,10.834127 12.71875,11.8125 0.146999,0.447079 0.30025,0.863113 0.46875,1.21875 0.230061,0.485567 0.470708,0.870402 0.78125,1.1875 0.310542,0.317098 0.742048,0.5625 1.21875,0.5625 0.476702,0 0.876958,-0.245402 1.1875,-0.5625 0.310542,-0.317098 0.582439,-0.701933 0.8125,-1.1875 0.172018,-0.363062 0.319101,-0.791709 0.46875,-1.25 6.249045,-1.017063 11.256351,-5.7184 12.625,-11.78125 0.447134,-0.1471 0.86321,-0.300595 1.21875,-0.46875 0.485434,-0.22959 0.901633,-0.502489 1.21875,-0.8125 0.317117,-0.310011 0.5625,-0.710861 0.5625,-1.1875 l -0.03125,0 c 0,-0.476639 -0.245383,-0.908739 -0.5625,-1.21875 C 89.901633,71.846239 89.516684,71.60459 89.03125,71.375 88.755626,71.244642 88.456123,71.117495 88.125,71 87.439949,64.078341 82.072807,58.503735 75.21875,57.375 c -0.15044,-0.461669 -0.326927,-0.884711 -0.5,-1.25 -0.230061,-0.485567 -0.501958,-0.870402 -0.8125,-1.1875 -0.310542,-0.317098 -0.710798,-0.5625 -1.1875,-0.5625 z m -0.0625,1.40625 c 0.03595,-0.01283 0.05968,0 0.0625,0 0.0056,0 0.04321,-0.02233 0.1875,0.125 0.144288,0.147334 0.34336,0.447188 0.53125,0.84375 0.06385,0.134761 0.123901,0.309578 0.1875,0.46875 -0.320353,-0.01957 -0.643524,-0.0625 -0.96875,-0.0625 -0.289073,0 -0.558569,0.04702 -0.84375,0.0625 C 71.8761,57.059578 71.936151,56.884761 72,56.75 c 0.18789,-0.396562 0.355712,-0.696416 0.5,-0.84375 0.07214,-0.07367 0.120304,-0.112167 0.15625,-0.125 z m 0,2.40625 c 0.448007,0 0.906196,0.05436 1.34375,0.09375 0.177011,0.592256 0.347655,1.271044 0.5,2.03125 0.475097,2.370753 0.807525,5.463852 0.9375,8.9375 -0.906869,-0.02852 -1.834463,-0.0625 -2.78125,-0.0625 -0.92298,0 -1.802327,0.03537 -2.6875,0.0625 0.138529,-3.473648 0.493653,-6.566747 0.96875,-8.9375 0.154684,-0.771878 0.320019,-1.463985 0.5,-2.0625 0.405568,-0.03377 0.804291,-0.0625 1.21875,-0.0625 z m -2.71875,0.28125 c -0.129732,0.498888 -0.259782,0.987558 -0.375,1.5625 -0.498513,2.487595 -0.838088,5.693299 -0.96875,9.25 -3.21363,0.15162 -6.119596,0.480068 -8.40625,0.9375 -0.682394,0.136509 -1.275579,0.279657 -1.84375,0.4375 0.799068,-6.135482 5.504716,-11.036454 11.59375,-12.1875 z M 75.5,58.5 c 6.043169,1.18408 10.705093,6.052712 11.5,12.15625 -0.569435,-0.155806 -1.200273,-0.302525 -1.875,-0.4375 -2.262525,-0.452605 -5.108535,-0.783809 -8.28125,-0.9375 -0.130662,-3.556701 -0.470237,-6.762405 -0.96875,-9.25 C 75.761959,59.467174 75.626981,58.990925 75.5,58.5 z m -2.84375,12.09375 c 0.959338,0 1.895843,0.03282 2.8125,0.0625 C 75.48165,71.267751 75.5,71.871028 75.5,72.5 c 0,1.228616 -0.01449,2.438313 -0.0625,3.59375 -0.897358,0.0284 -1.811972,0.0625 -2.75,0.0625 -0.927373,0 -1.831062,-0.03473 -2.71875,-0.0625 -0.05109,-1.155437 -0.0625,-2.365134 -0.0625,-3.59375 0,-0.628972 0.01741,-1.232249 0.03125,-1.84375 0.895269,-0.02827 1.783025,-0.0625 2.71875,-0.0625 z M 68.5625,70.6875 c -0.01243,0.60601 -0.03125,1.189946 -0.03125,1.8125 0,1.22431 0.01541,2.407837 0.0625,3.5625 -3.125243,-0.150329 -5.92077,-0.471558 -8.09375,-0.90625 -0.784983,-0.157031 -1.511491,-0.316471 -2.125,-0.5 -0.107878,-0.704096 -0.1875,-1.422089 -0.1875,-2.15625 0,-0.115714 0.02849,-0.228688 0.03125,-0.34375 0.643106,-0.20284 1.389577,-0.390377 2.25,-0.5625 2.166953,-0.433487 4.97905,-0.75541 8.09375,-0.90625 z m 8.3125,0.03125 c 3.075121,0.15271 5.824455,0.446046 7.96875,0.875 0.857478,0.171534 1.630962,0.360416 2.28125,0.5625 0.0027,0.114659 0,0.228443 0,0.34375 0,0.735827 -0.07914,1.450633 -0.1875,2.15625 -0.598568,0.180148 -1.29077,0.34562 -2.0625,0.5 -2.158064,0.431708 -4.932088,0.754666 -8.03125,0.90625 0.04709,-1.154663 0.0625,-2.33819 0.0625,-3.5625 0,-0.611824 -0.01924,-1.185379 -0.03125,-1.78125 z M 57.15625,72.5625 c 0.0023,0.572772 0.06082,1.131112 0.125,1.6875 -0.125327,-0.05123 -0.266577,-0.10497 -0.375,-0.15625 -0.396499,-0.187528 -0.665288,-0.387337 -0.8125,-0.53125 -0.147212,-0.143913 -0.15625,-0.182756 -0.15625,-0.1875 0,-0.0047 -0.02221,-0.07484 0.125,-0.21875 0.147212,-0.143913 0.447251,-0.312472 0.84375,-0.5 0.07123,-0.03369 0.171867,-0.06006 0.25,-0.09375 z m 31.03125,0 c 0.08201,0.03503 0.175941,0.05872 0.25,0.09375 0.396499,0.187528 0.665288,0.356087 0.8125,0.5 0.14725,0.14391 0.15625,0.21405 0.15625,0.21875 0,0.0047 -0.009,0.04359 -0.15625,0.1875 -0.147212,0.143913 -0.416001,0.343722 -0.8125,0.53125 -0.09755,0.04613 -0.233314,0.07889 -0.34375,0.125 0.06214,-0.546289 0.09144,-1.094215 0.09375,-1.65625 z m -29.5,3.625 c 0.479308,0.123125 0.983064,0.234089 1.53125,0.34375 2.301781,0.460458 5.229421,0.787224 8.46875,0.9375 0.167006,2.84339 0.46081,5.433176 0.875,7.5 0.115218,0.574942 0.245268,1.063612 0.375,1.5625 -5.463677,-1.028179 -9.833074,-5.091831 -11.25,-10.34375 z m 27.96875,0 C 85.247546,81.408945 80.919274,85.442932 75.5,86.5 c 0.126981,-0.490925 0.261959,-0.967174 0.375,-1.53125 0.41419,-2.066824 0.707994,-4.65661 0.875,-7.5 3.204493,-0.15162 6.088346,-0.480068 8.375,-0.9375 0.548186,-0.109661 1.051942,-0.220625 1.53125,-0.34375 z M 70.0625,77.53125 c 0.865391,0.02589 1.723666,0.03125 2.625,0.03125 0.912062,0 1.782843,-0.0048 2.65625,-0.03125 -0.165173,2.736408 -0.453252,5.207651 -0.84375,7.15625 -0.152345,0.760206 -0.322989,1.438994 -0.5,2.03125 -0.437447,0.03919 -0.895856,0.0625 -1.34375,0.0625 -0.414943,0 -0.812719,-0.02881 -1.21875,-0.0625 -0.177011,-0.592256 -0.347655,-1.271044 -0.5,-2.03125 -0.390498,-1.948599 -0.700644,-4.419842 -0.875,-7.15625 z m 1.75,10.28125 c 0.284911,0.01545 0.554954,0.03125 0.84375,0.03125 0.325029,0 0.648588,-0.01171 0.96875,-0.03125 -0.05999,0.148763 -0.127309,0.31046 -0.1875,0.4375 -0.18789,0.396562 -0.386962,0.696416 -0.53125,0.84375 -0.144288,0.147334 -0.181857,0.125 -0.1875,0.125 -0.0056,0 -0.07446,0.02233 -0.21875,-0.125 C 72.355712,88.946416 72.18789,88.646562 72,88.25 71.939809,88.12296 71.872486,87.961263 71.8125,87.8125 z';
});
define('svgCompassRotationMarker', [], function () {
    return 'M 72.46875,22.03125 C 59.505873,22.050338 46.521615,27.004287 36.6875,36.875 L 47.84375,47.96875 C 61.521556,34.240041 83.442603,34.227389 97.125,47.90625 l 11.125,-11.125 C 98.401629,26.935424 85.431627,22.012162 72.46875,22.03125 z';
});
'use strict';
define('NavigationViewModel', [
    'Knockout',
    'loadView',
    'inherit',
    'ResetViewNavigationControl',
    'ZoomInNavigationControl',
    'ZoomOutNavigationControl',
    'svgCompassOuterRing',
    'svgCompassGyro',
    'svgCompassRotationMarker'
], function (Knockout, loadView, inherit, ResetViewNavigationControl, ZoomInNavigationControl, ZoomOutNavigationControl, svgCompassOuterRing, svgCompassGyro, svgCompassRotationMarker) {
    var NavigationViewModel = function (options) {
        this.terria = options.terria;
        this.eventHelper = new Cesium.EventHelper();
        this.controls = options.controls;
        if (!Cesium.defined(this.controls)) {
            this.controls = [
                new ZoomInNavigationControl(this.terria),
                new ResetViewNavigationControl(this.terria),
                new ZoomOutNavigationControl(this.terria)
            ];
        }
        this.svgCompassOuterRing = svgCompassOuterRing;
        this.svgCompassGyro = svgCompassGyro;
        this.svgCompassRotationMarker = svgCompassRotationMarker;
        this.showCompass = Cesium.defined(this.terria);
        this.heading = this.showCompass ? this.terria.scene.camera.heading : 0;
        this.isOrbiting = false;
        this.orbitCursorAngle = 0;
        this.orbitCursorOpacity = 0;
        this.orbitLastTimestamp = 0;
        this.orbitFrame = undefined;
        this.orbitIsLook = false;
        this.orbitMouseMoveFunction = undefined;
        this.orbitMouseUpFunction = undefined;
        this.isRotating = false;
        this.rotateInitialCursorAngle = undefined;
        this.rotateFrame = undefined;
        this.rotateIsLook = false;
        this.rotateMouseMoveFunction = undefined;
        this.rotateMouseUpFunction = undefined;
        this._unsubcribeFromPostRender = undefined;
        Knockout.track(this, [
            'controls',
            'showCompass',
            'heading',
            'isOrbiting',
            'orbitCursorAngle',
            'isRotating'
        ]);
        var that = this;
        function viewerChange() {
            if (Cesium.defined(that.terria)) {
                if (that._unsubcribeFromPostRender) {
                    that._unsubcribeFromPostRender();
                    that._unsubcribeFromPostRender = undefined;
                }
                that.showCompass = true;
                that._unsubcribeFromPostRender = that.terria.scene.postRender.addEventListener(function () {
                    that.heading = that.terria.scene.camera.heading;
                });
            } else {
                if (that._unsubcribeFromPostRender) {
                    that._unsubcribeFromPostRender();
                    that._unsubcribeFromPostRender = undefined;
                }
                that.showCompass = false;
            }
        }
        this.eventHelper.add(this.terria.afterViewerChanged, viewerChange, this);
        viewerChange();
    };
    NavigationViewModel.prototype.destroy = function () {
        this.eventHelper.removeAll();
    };
    NavigationViewModel.prototype.show = function (container) {
        var testing = '<div class="compass" title="Drag outer ring: rotate view. ' + 'Drag inner gyroscope: free orbit.' + 'Double-click: reset view.' + 'TIP: You can also free orbit by holding the CTRL key and dragging the map." data-bind="visible: showCompass, event: { mousedown: handleMouseDown, dblclick: handleDoubleClick }">' + '<div class="compass-outer-ring-background"></div>' + ' <div class="compass-rotation-marker" data-bind="visible: isOrbiting, style: { transform: \'rotate(-\' + orbitCursorAngle + \'rad)\', \'-webkit-transform\': \'rotate(-\' + orbitCursorAngle + \'rad)\', opacity: orbitCursorOpacity }, cesiumSvgPath: { path: svgCompassRotationMarker, width: 145, height: 145 }"></div>' + ' <div class="compass-outer-ring" title="Click and drag to rotate the camera" data-bind="style: { transform: \'rotate(-\' + heading + \'rad)\', \'-webkit-transform\': \'rotate(-\' + heading + \'rad)\' }, cesiumSvgPath: { path: svgCompassOuterRing, width: 145, height: 145 }"></div>' + ' <div class="compass-gyro-background"></div>' + ' <div class="compass-gyro" data-bind="cesiumSvgPath: { path: svgCompassGyro, width: 145, height: 145 }, css: { \'compass-gyro-active\': isOrbiting }"></div>' + '</div>' + '<div class="navigation-controls">' + '<!-- ko foreach: controls -->' + '<div data-bind="click: activate, attr: { title: $data.name }, css: $root.isLastControl($data) ? \'navigation-control-last\' : \'navigation-control\' ">' + '   <!-- ko if: $data.hasText -->' + '   <div data-bind="text: $data.text, css: $data.isActive ?  \'navigation-control-icon-active \' + $data.cssClass : $data.cssClass"></div>' + '   <!-- /ko -->' + '  <!-- ko ifnot: $data.hasText -->' + '  <div data-bind="cesiumSvgPath: { path: $data.svgIcon, width: $data.svgWidth, height: $data.svgHeight }, css: $data.isActive ?  \'navigation-control-icon-active \' + $data.cssClass : $data.cssClass"></div>' + '  <!-- /ko -->' + ' </div>' + ' <!-- /ko -->' + '</div>';
        loadView(testing, container, this);
    };
    NavigationViewModel.prototype.add = function (control) {
        this.controls.push(control);
    };
    NavigationViewModel.prototype.remove = function (control) {
        this.controls.remove(control);
    };
    NavigationViewModel.prototype.isLastControl = function (control) {
        return control === this.controls[this.controls.length - 1];
    };
    var vectorScratch = new Cesium.Cartesian2();
    NavigationViewModel.prototype.handleMouseDown = function (viewModel, e) {
        var compassElement = e.currentTarget;
        var compassRectangle = e.currentTarget.getBoundingClientRect();
        var maxDistance = compassRectangle.width / 2;
        var center = new Cesium.Cartesian2((compassRectangle.right - compassRectangle.left) / 2, (compassRectangle.bottom - compassRectangle.top) / 2);
        var clickLocation = new Cesium.Cartesian2(e.clientX - compassRectangle.left, e.clientY - compassRectangle.top);
        var vector = Cesium.Cartesian2.subtract(clickLocation, center, vectorScratch);
        var distanceFromCenter = Cesium.Cartesian2.magnitude(vector);
        var distanceFraction = distanceFromCenter / maxDistance;
        var nominalTotalRadius = 145;
        var norminalGyroRadius = 50;
        if (distanceFraction < norminalGyroRadius / nominalTotalRadius) {
            orbit(this, compassElement, vector);
        } else if (distanceFraction < 1) {
            rotate(this, compassElement, vector);
        } else {
            return true;
        }
    };
    var oldTransformScratch = new Cesium.Matrix4();
    var newTransformScratch = new Cesium.Matrix4();
    var centerScratch = new Cesium.Cartesian3();
    var windowPositionScratch = new Cesium.Cartesian2();
    var pickRayScratch = new Cesium.Ray();
    NavigationViewModel.prototype.handleDoubleClick = function (viewModel, e) {
        var scene = this.terria.scene;
        var camera = scene.camera;
        var windowPosition = windowPositionScratch;
        windowPosition.x = scene.canvas.clientWidth / 2;
        windowPosition.y = scene.canvas.clientHeight / 2;
        var ray = camera.getPickRay(windowPosition, pickRayScratch);
        var center = scene.globe.pick(ray, scene, centerScratch);
        if (!Cesium.defined(center)) {
            this.terria.currentViewer.zoomTo(this.terria.homeView, 1.5);
            return;
        }
        var rotateFrame = Cesium.Transforms.eastNorthUpToFixedFrame(center, Cesium.Ellipsoid.WGS84);
        var lookVector = Cesium.Cartesian3.subtract(center, camera.position, new Cesium.Cartesian3());
        var flight = Cesium.CameraFlightPath.createTween(scene, {
            destination: Cesium.Matrix4.multiplyByPoint(rotateFrame, new Cesium.Cartesian3(0, 0, Cesium.Cartesian3.magnitude(lookVector)), new Cesium.Cartesian3()),
            direction: Cesium.Matrix4.multiplyByPointAsVector(rotateFrame, new Cesium.Cartesian3(0, 0, -1), new Cesium.Cartesian3()),
            up: Cesium.Matrix4.multiplyByPointAsVector(rotateFrame, new Cesium.Cartesian3(0, 1, 0), new Cesium.Cartesian3()),
            duration: 1.5
        });
        scene.tweens.add(flight);
    };
    NavigationViewModel.create = function (options) {
        var result = new NavigationViewModel(options);
        result.show(options.container);
        return result;
    };
    function orbit(viewModel, compassElement, cursorVector) {
        document.removeEventListener('mousemove', viewModel.orbitMouseMoveFunction, false);
        document.removeEventListener('mouseup', viewModel.orbitMouseUpFunction, false);
        if (Cesium.defined(viewModel.orbitTickFunction)) {
            viewModel.terria.currentViewer.clock.onTick.removeEventListener(viewModel.orbitTickFunction);
        }
        viewModel.orbitMouseMoveFunction = undefined;
        viewModel.orbitMouseUpFunction = undefined;
        viewModel.orbitTickFunction = undefined;
        viewModel.isOrbiting = true;
        viewModel.orbitLastTimestamp = Cesium.getTimestamp();
        var scene = viewModel.terria.scene;
        var camera = scene.camera;
        var windowPosition = windowPositionScratch;
        windowPosition.x = scene.canvas.clientWidth / 2;
        windowPosition.y = scene.canvas.clientHeight / 2;
        var ray = camera.getPickRay(windowPosition, pickRayScratch);
        var center = scene.globe.pick(ray, scene, centerScratch);
        if (!Cesium.defined(center)) {
            viewModel.orbitFrame = Cesium.Transforms.eastNorthUpToFixedFrame(camera.positionWC, Cesium.Ellipsoid.WGS84, newTransformScratch);
            viewModel.orbitIsLook = true;
        } else {
            viewModel.orbitFrame = Cesium.Transforms.eastNorthUpToFixedFrame(center, Cesium.Ellipsoid.WGS84, newTransformScratch);
            viewModel.orbitIsLook = false;
        }
        viewModel.orbitTickFunction = function (e) {
            var timestamp = Cesium.getTimestamp();
            var deltaT = timestamp - viewModel.orbitLastTimestamp;
            var rate = (viewModel.orbitCursorOpacity - 0.5) * 2.5 / 1000;
            var distance = deltaT * rate;
            var angle = viewModel.orbitCursorAngle + Cesium.Math.PI_OVER_TWO;
            var x = Math.cos(angle) * distance;
            var y = Math.sin(angle) * distance;
            var scene = viewModel.terria.scene;
            var camera = scene.camera;
            var oldTransform = Cesium.Matrix4.clone(camera.transform, oldTransformScratch);
            camera.lookAtTransform(viewModel.orbitFrame);
            if (viewModel.orbitIsLook) {
                camera.look(Cesium.Cartesian3.UNIT_Z, -x);
                camera.look(camera.right, -y);
            } else {
                camera.rotateLeft(x);
                camera.rotateUp(y);
            }
            camera.lookAtTransform(oldTransform);
            viewModel.orbitLastTimestamp = timestamp;
        };
        function updateAngleAndOpacity(vector, compassWidth) {
            var angle = Math.atan2(-vector.y, vector.x);
            viewModel.orbitCursorAngle = Cesium.Math.zeroToTwoPi(angle - Cesium.Math.PI_OVER_TWO);
            var distance = Cesium.Cartesian2.magnitude(vector);
            var maxDistance = compassWidth / 2;
            var distanceFraction = Math.min(distance / maxDistance, 1);
            var easedOpacity = 0.5 * distanceFraction * distanceFraction + 0.5;
            viewModel.orbitCursorOpacity = easedOpacity;
        }
        viewModel.orbitMouseMoveFunction = function (e) {
            var compassRectangle = compassElement.getBoundingClientRect();
            var center = new Cesium.Cartesian2((compassRectangle.right - compassRectangle.left) / 2, (compassRectangle.bottom - compassRectangle.top) / 2);
            var clickLocation = new Cesium.Cartesian2(e.clientX - compassRectangle.left, e.clientY - compassRectangle.top);
            var vector = Cesium.Cartesian2.subtract(clickLocation, center, vectorScratch);
            updateAngleAndOpacity(vector, compassRectangle.width);
        };
        viewModel.orbitMouseUpFunction = function (e) {
            viewModel.isOrbiting = false;
            document.removeEventListener('mousemove', viewModel.orbitMouseMoveFunction, false);
            document.removeEventListener('mouseup', viewModel.orbitMouseUpFunction, false);
            if (Cesium.defined(viewModel.orbitTickFunction)) {
                viewModel.terria.currentViewer.clock.onTick.removeEventListener(viewModel.orbitTickFunction);
            }
            viewModel.orbitMouseMoveFunction = undefined;
            viewModel.orbitMouseUpFunction = undefined;
            viewModel.orbitTickFunction = undefined;
        };
        document.addEventListener('mousemove', viewModel.orbitMouseMoveFunction, false);
        document.addEventListener('mouseup', viewModel.orbitMouseUpFunction, false);
        viewModel.terria.currentViewer.clock.onTick.addEventListener(viewModel.orbitTickFunction);
        updateAngleAndOpacity(cursorVector, compassElement.getBoundingClientRect().width);
    }
    function rotate(viewModel, compassElement, cursorVector) {
        document.removeEventListener('mousemove', viewModel.rotateMouseMoveFunction, false);
        document.removeEventListener('mouseup', viewModel.rotateMouseUpFunction, false);
        viewModel.rotateMouseMoveFunction = undefined;
        viewModel.rotateMouseUpFunction = undefined;
        viewModel.isRotating = true;
        viewModel.rotateInitialCursorAngle = Math.atan2(-cursorVector.y, cursorVector.x);
        var scene = viewModel.terria.scene;
        var camera = scene.camera;
        var windowPosition = windowPositionScratch;
        windowPosition.x = scene.canvas.clientWidth / 2;
        windowPosition.y = scene.canvas.clientHeight / 2;
        var ray = camera.getPickRay(windowPosition, pickRayScratch);
        var viewCenter = scene.globe.pick(ray, scene, centerScratch);
        if (!Cesium.defined(viewCenter)) {
            viewModel.rotateFrame = Cesium.Transforms.eastNorthUpToFixedFrame(camera.positionWC, Cesium.Ellipsoid.WGS84, newTransformScratch);
            viewModel.rotateIsLook = true;
        } else {
            viewModel.rotateFrame = Cesium.Transforms.eastNorthUpToFixedFrame(viewCenter, Cesium.Ellipsoid.WGS84, newTransformScratch);
            viewModel.rotateIsLook = false;
        }
        var oldTransform = Cesium.Matrix4.clone(camera.transform, oldTransformScratch);
        camera.lookAtTransform(viewModel.rotateFrame);
        viewModel.rotateInitialCameraAngle = Math.atan2(camera.position.y, camera.position.x);
        viewModel.rotateInitialCameraDistance = Cesium.Cartesian3.magnitude(new Cesium.Cartesian3(camera.position.x, camera.position.y, 0));
        camera.lookAtTransform(oldTransform);
        viewModel.rotateMouseMoveFunction = function (e) {
            var compassRectangle = compassElement.getBoundingClientRect();
            var center = new Cesium.Cartesian2((compassRectangle.right - compassRectangle.left) / 2, (compassRectangle.bottom - compassRectangle.top) / 2);
            var clickLocation = new Cesium.Cartesian2(e.clientX - compassRectangle.left, e.clientY - compassRectangle.top);
            var vector = Cesium.Cartesian2.subtract(clickLocation, center, vectorScratch);
            var angle = Math.atan2(-vector.y, vector.x);
            var angleDifference = angle - viewModel.rotateInitialCursorAngle;
            var newCameraAngle = Cesium.Math.zeroToTwoPi(viewModel.rotateInitialCameraAngle - angleDifference);
            var camera = viewModel.terria.scene.camera;
            var oldTransform = Cesium.Matrix4.clone(camera.transform, oldTransformScratch);
            camera.lookAtTransform(viewModel.rotateFrame);
            var currentCameraAngle = Math.atan2(camera.position.y, camera.position.x);
            camera.rotateRight(newCameraAngle - currentCameraAngle);
            camera.lookAtTransform(oldTransform);
        };
        viewModel.rotateMouseUpFunction = function (e) {
            viewModel.isRotating = false;
            document.removeEventListener('mousemove', viewModel.rotateMouseMoveFunction, false);
            document.removeEventListener('mouseup', viewModel.rotateMouseUpFunction, false);
            viewModel.rotateMouseMoveFunction = undefined;
            viewModel.rotateMouseUpFunction = undefined;
        };
        document.addEventListener('mousemove', viewModel.rotateMouseMoveFunction, false);
        document.addEventListener('mouseup', viewModel.rotateMouseUpFunction, false);
    }
    return NavigationViewModel;
});
var URI = function () {
    function parse(uriStr) {
        var m = ('' + uriStr).match(URI_RE_);
        if (!m) {
            return null;
        }
        return new URI(nullIfAbsent(m[1]), nullIfAbsent(m[2]), nullIfAbsent(m[3]), nullIfAbsent(m[4]), nullIfAbsent(m[5]), nullIfAbsent(m[6]), nullIfAbsent(m[7]));
    }
    function create(scheme, credentials, domain, port, path, query, fragment) {
        var uri = new URI(encodeIfExists2(scheme, URI_DISALLOWED_IN_SCHEME_OR_CREDENTIALS_), encodeIfExists2(credentials, URI_DISALLOWED_IN_SCHEME_OR_CREDENTIALS_), encodeIfExists(domain), port > 0 ? port.toString() : null, encodeIfExists2(path, URI_DISALLOWED_IN_PATH_), null, encodeIfExists(fragment));
        if (query) {
            if ('string' === typeof query) {
                uri.setRawQuery(query.replace(/[^?&=0-9A-Za-z_\-~.%]/g, encodeOne));
            } else {
                uri.setAllParameters(query);
            }
        }
        return uri;
    }
    function encodeIfExists(unescapedPart) {
        if ('string' == typeof unescapedPart) {
            return encodeURIComponent(unescapedPart);
        }
        return null;
    }
    ;
    function encodeIfExists2(unescapedPart, extra) {
        if ('string' == typeof unescapedPart) {
            return encodeURI(unescapedPart).replace(extra, encodeOne);
        }
        return null;
    }
    ;
    function encodeOne(ch) {
        var n = ch.charCodeAt(0);
        return '%' + '0123456789ABCDEF'.charAt(n >> 4 & 15) + '0123456789ABCDEF'.charAt(n & 15);
    }
    function normPath(path) {
        return path.replace(/(^|\/)\.(?:\/|$)/g, '$1').replace(/\/{2,}/g, '/');
    }
    var PARENT_DIRECTORY_HANDLER = new RegExp('' + '(/|^)' + '(?:[^./][^/]*|\\.{2,}(?:[^./][^/]*)|\\.{3,}[^/]*)' + '/\\.\\.(?:/|$)');
    var PARENT_DIRECTORY_HANDLER_RE = new RegExp(PARENT_DIRECTORY_HANDLER);
    var EXTRA_PARENT_PATHS_RE = /^(?:\.\.\/)*(?:\.\.$)?/;
    function collapse_dots(path) {
        if (path === null) {
            return null;
        }
        var p = normPath(path);
        var r = PARENT_DIRECTORY_HANDLER_RE;
        for (var q; (q = p.replace(r, '$1')) != p; p = q) {
        }
        ;
        return p;
    }
    function resolve(baseUri, relativeUri) {
        var absoluteUri = baseUri.clone();
        var overridden = relativeUri.hasScheme();
        if (overridden) {
            absoluteUri.setRawScheme(relativeUri.getRawScheme());
        } else {
            overridden = relativeUri.hasCredentials();
        }
        if (overridden) {
            absoluteUri.setRawCredentials(relativeUri.getRawCredentials());
        } else {
            overridden = relativeUri.hasDomain();
        }
        if (overridden) {
            absoluteUri.setRawDomain(relativeUri.getRawDomain());
        } else {
            overridden = relativeUri.hasPort();
        }
        var rawPath = relativeUri.getRawPath();
        var simplifiedPath = collapse_dots(rawPath);
        if (overridden) {
            absoluteUri.setPort(relativeUri.getPort());
            simplifiedPath = simplifiedPath && simplifiedPath.replace(EXTRA_PARENT_PATHS_RE, '');
        } else {
            overridden = !!rawPath;
            if (overridden) {
                if (simplifiedPath.charCodeAt(0) !== 47) {
                    var absRawPath = collapse_dots(absoluteUri.getRawPath() || '').replace(EXTRA_PARENT_PATHS_RE, '');
                    var slash = absRawPath.lastIndexOf('/') + 1;
                    simplifiedPath = collapse_dots((slash ? absRawPath.substring(0, slash) : '') + collapse_dots(rawPath)).replace(EXTRA_PARENT_PATHS_RE, '');
                }
            } else {
                simplifiedPath = simplifiedPath && simplifiedPath.replace(EXTRA_PARENT_PATHS_RE, '');
                if (simplifiedPath !== rawPath) {
                    absoluteUri.setRawPath(simplifiedPath);
                }
            }
        }
        if (overridden) {
            absoluteUri.setRawPath(simplifiedPath);
        } else {
            overridden = relativeUri.hasQuery();
        }
        if (overridden) {
            absoluteUri.setRawQuery(relativeUri.getRawQuery());
        } else {
            overridden = relativeUri.hasFragment();
        }
        if (overridden) {
            absoluteUri.setRawFragment(relativeUri.getRawFragment());
        }
        return absoluteUri;
    }
    function URI(rawScheme, rawCredentials, rawDomain, port, rawPath, rawQuery, rawFragment) {
        this.scheme_ = rawScheme;
        this.credentials_ = rawCredentials;
        this.domain_ = rawDomain;
        this.port_ = port;
        this.path_ = rawPath;
        this.query_ = rawQuery;
        this.fragment_ = rawFragment;
        this.paramCache_ = null;
    }
    URI.prototype.toString = function () {
        var out = [];
        if (null !== this.scheme_) {
            out.push(this.scheme_, ':');
        }
        if (null !== this.domain_) {
            out.push('//');
            if (null !== this.credentials_) {
                out.push(this.credentials_, '@');
            }
            out.push(this.domain_);
            if (null !== this.port_) {
                out.push(':', this.port_.toString());
            }
        }
        if (null !== this.path_) {
            out.push(this.path_);
        }
        if (null !== this.query_) {
            out.push('?', this.query_);
        }
        if (null !== this.fragment_) {
            out.push('#', this.fragment_);
        }
        return out.join('');
    };
    URI.prototype.clone = function () {
        return new URI(this.scheme_, this.credentials_, this.domain_, this.port_, this.path_, this.query_, this.fragment_);
    };
    URI.prototype.getScheme = function () {
        return this.scheme_ && decodeURIComponent(this.scheme_).toLowerCase();
    };
    URI.prototype.getRawScheme = function () {
        return this.scheme_;
    };
    URI.prototype.setScheme = function (newScheme) {
        this.scheme_ = encodeIfExists2(newScheme, URI_DISALLOWED_IN_SCHEME_OR_CREDENTIALS_);
        return this;
    };
    URI.prototype.setRawScheme = function (newScheme) {
        this.scheme_ = newScheme ? newScheme : null;
        return this;
    };
    URI.prototype.hasScheme = function () {
        return null !== this.scheme_;
    };
    URI.prototype.getCredentials = function () {
        return this.credentials_ && decodeURIComponent(this.credentials_);
    };
    URI.prototype.getRawCredentials = function () {
        return this.credentials_;
    };
    URI.prototype.setCredentials = function (newCredentials) {
        this.credentials_ = encodeIfExists2(newCredentials, URI_DISALLOWED_IN_SCHEME_OR_CREDENTIALS_);
        return this;
    };
    URI.prototype.setRawCredentials = function (newCredentials) {
        this.credentials_ = newCredentials ? newCredentials : null;
        return this;
    };
    URI.prototype.hasCredentials = function () {
        return null !== this.credentials_;
    };
    URI.prototype.getDomain = function () {
        return this.domain_ && decodeURIComponent(this.domain_);
    };
    URI.prototype.getRawDomain = function () {
        return this.domain_;
    };
    URI.prototype.setDomain = function (newDomain) {
        return this.setRawDomain(newDomain && encodeURIComponent(newDomain));
    };
    URI.prototype.setRawDomain = function (newDomain) {
        this.domain_ = newDomain ? newDomain : null;
        return this.setRawPath(this.path_);
    };
    URI.prototype.hasDomain = function () {
        return null !== this.domain_;
    };
    URI.prototype.getPort = function () {
        return this.port_ && decodeURIComponent(this.port_);
    };
    URI.prototype.setPort = function (newPort) {
        if (newPort) {
            newPort = Number(newPort);
            if (newPort !== (newPort & 65535)) {
                throw new Error('Bad port number ' + newPort);
            }
            this.port_ = '' + newPort;
        } else {
            this.port_ = null;
        }
        return this;
    };
    URI.prototype.hasPort = function () {
        return null !== this.port_;
    };
    URI.prototype.getPath = function () {
        return this.path_ && decodeURIComponent(this.path_);
    };
    URI.prototype.getRawPath = function () {
        return this.path_;
    };
    URI.prototype.setPath = function (newPath) {
        return this.setRawPath(encodeIfExists2(newPath, URI_DISALLOWED_IN_PATH_));
    };
    URI.prototype.setRawPath = function (newPath) {
        if (newPath) {
            newPath = String(newPath);
            this.path_ = !this.domain_ || /^\//.test(newPath) ? newPath : '/' + newPath;
        } else {
            this.path_ = null;
        }
        return this;
    };
    URI.prototype.hasPath = function () {
        return null !== this.path_;
    };
    URI.prototype.getQuery = function () {
        return this.query_ && decodeURIComponent(this.query_).replace(/\+/g, ' ');
    };
    URI.prototype.getRawQuery = function () {
        return this.query_;
    };
    URI.prototype.setQuery = function (newQuery) {
        this.paramCache_ = null;
        this.query_ = encodeIfExists(newQuery);
        return this;
    };
    URI.prototype.setRawQuery = function (newQuery) {
        this.paramCache_ = null;
        this.query_ = newQuery ? newQuery : null;
        return this;
    };
    URI.prototype.hasQuery = function () {
        return null !== this.query_;
    };
    URI.prototype.setAllParameters = function (params) {
        if (typeof params === 'object') {
            if (!(params instanceof Array) && (params instanceof Object || Object.prototype.toString.call(params) !== '[object Array]')) {
                var newParams = [];
                var i = -1;
                for (var k in params) {
                    var v = params[k];
                    if ('string' === typeof v) {
                        newParams[++i] = k;
                        newParams[++i] = v;
                    }
                }
                params = newParams;
            }
        }
        this.paramCache_ = null;
        var queryBuf = [];
        var separator = '';
        for (var j = 0; j < params.length;) {
            var k = params[j++];
            var v = params[j++];
            queryBuf.push(separator, encodeURIComponent(k.toString()));
            separator = '&';
            if (v) {
                queryBuf.push('=', encodeURIComponent(v.toString()));
            }
        }
        this.query_ = queryBuf.join('');
        return this;
    };
    URI.prototype.checkParameterCache_ = function () {
        if (!this.paramCache_) {
            var q = this.query_;
            if (!q) {
                this.paramCache_ = [];
            } else {
                var cgiParams = q.split(/[&\?]/);
                var out = [];
                var k = -1;
                for (var i = 0; i < cgiParams.length; ++i) {
                    var m = cgiParams[i].match(/^([^=]*)(?:=(.*))?$/);
                    out[++k] = decodeURIComponent(m[1]).replace(/\+/g, ' ');
                    out[++k] = decodeURIComponent(m[2] || '').replace(/\+/g, ' ');
                }
                this.paramCache_ = out;
            }
        }
    };
    URI.prototype.setParameterValues = function (key, values) {
        if (typeof values === 'string') {
            values = [values];
        }
        this.checkParameterCache_();
        var newValueIndex = 0;
        var pc = this.paramCache_;
        var params = [];
        for (var i = 0, k = 0; i < pc.length; i += 2) {
            if (key === pc[i]) {
                if (newValueIndex < values.length) {
                    params.push(key, values[newValueIndex++]);
                }
            } else {
                params.push(pc[i], pc[i + 1]);
            }
        }
        while (newValueIndex < values.length) {
            params.push(key, values[newValueIndex++]);
        }
        this.setAllParameters(params);
        return this;
    };
    URI.prototype.removeParameter = function (key) {
        return this.setParameterValues(key, []);
    };
    URI.prototype.getAllParameters = function () {
        this.checkParameterCache_();
        return this.paramCache_.slice(0, this.paramCache_.length);
    };
    URI.prototype.getParameterValues = function (paramNameUnescaped) {
        this.checkParameterCache_();
        var values = [];
        for (var i = 0; i < this.paramCache_.length; i += 2) {
            if (paramNameUnescaped === this.paramCache_[i]) {
                values.push(this.paramCache_[i + 1]);
            }
        }
        return values;
    };
    URI.prototype.getParameterMap = function (paramNameUnescaped) {
        this.checkParameterCache_();
        var paramMap = {};
        for (var i = 0; i < this.paramCache_.length; i += 2) {
            var key = this.paramCache_[i++], value = this.paramCache_[i++];
            if (!(key in paramMap)) {
                paramMap[key] = [value];
            } else {
                paramMap[key].push(value);
            }
        }
        return paramMap;
    };
    URI.prototype.getParameterValue = function (paramNameUnescaped) {
        this.checkParameterCache_();
        for (var i = 0; i < this.paramCache_.length; i += 2) {
            if (paramNameUnescaped === this.paramCache_[i]) {
                return this.paramCache_[i + 1];
            }
        }
        return null;
    };
    URI.prototype.getFragment = function () {
        return this.fragment_ && decodeURIComponent(this.fragment_);
    };
    URI.prototype.getRawFragment = function () {
        return this.fragment_;
    };
    URI.prototype.setFragment = function (newFragment) {
        this.fragment_ = newFragment ? encodeURIComponent(newFragment) : null;
        return this;
    };
    URI.prototype.setRawFragment = function (newFragment) {
        this.fragment_ = newFragment ? newFragment : null;
        return this;
    };
    URI.prototype.hasFragment = function () {
        return null !== this.fragment_;
    };
    function nullIfAbsent(matchPart) {
        return 'string' == typeof matchPart && matchPart.length > 0 ? matchPart : null;
    }
    var URI_RE_ = new RegExp('^' + '(?:' + '([^:/?#]+)' + ':)?' + '(?://' + '(?:([^/?#]*)@)?' + '([^/?#:@]*)' + '(?::([0-9]+))?' + ')?' + '([^?#]+)?' + '(?:\\?([^#]*))?' + '(?:#(.*))?' + '$');
    var URI_DISALLOWED_IN_SCHEME_OR_CREDENTIALS_ = /[#\/\?@]/g;
    var URI_DISALLOWED_IN_PATH_ = /[\#\?]/g;
    URI.parse = parse;
    URI.create = create;
    URI.resolve = resolve;
    URI.collapse_dots = collapse_dots;
    URI.utils = {
        mimeTypeOf: function (uri) {
            var uriObj = parse(uri);
            if (/\.html$/.test(uriObj.getPath())) {
                return 'text/html';
            } else {
                return 'application/javascript';
            }
        },
        resolve: function (base, uri) {
            if (base) {
                return resolve(parse(base), parse(uri)).toString();
            } else {
                return '' + uri;
            }
        }
    };
    return URI;
}();
var html4 = {};
html4.atype = {
    'NONE': 0,
    'URI': 1,
    'URI_FRAGMENT': 11,
    'SCRIPT': 2,
    'STYLE': 3,
    'HTML': 12,
    'ID': 4,
    'IDREF': 5,
    'IDREFS': 6,
    'GLOBAL_NAME': 7,
    'LOCAL_NAME': 8,
    'CLASSES': 9,
    'FRAME_TARGET': 10,
    'MEDIA_QUERY': 13
};
html4['atype'] = html4.atype;
html4.ATTRIBS = {
    '*::class': 9,
    '*::dir': 0,
    '*::draggable': 0,
    '*::hidden': 0,
    '*::id': 4,
    '*::inert': 0,
    '*::itemprop': 0,
    '*::itemref': 6,
    '*::itemscope': 0,
    '*::lang': 0,
    '*::onblur': 2,
    '*::onchange': 2,
    '*::onclick': 2,
    '*::ondblclick': 2,
    '*::onfocus': 2,
    '*::onkeydown': 2,
    '*::onkeypress': 2,
    '*::onkeyup': 2,
    '*::onload': 2,
    '*::onmousedown': 2,
    '*::onmousemove': 2,
    '*::onmouseout': 2,
    '*::onmouseover': 2,
    '*::onmouseup': 2,
    '*::onreset': 2,
    '*::onscroll': 2,
    '*::onselect': 2,
    '*::onsubmit': 2,
    '*::onunload': 2,
    '*::spellcheck': 0,
    '*::style': 3,
    '*::title': 0,
    '*::translate': 0,
    'a::accesskey': 0,
    'a::coords': 0,
    'a::href': 1,
    'a::hreflang': 0,
    'a::name': 7,
    'a::onblur': 2,
    'a::onfocus': 2,
    'a::shape': 0,
    'a::tabindex': 0,
    'a::target': 10,
    'a::type': 0,
    'area::accesskey': 0,
    'area::alt': 0,
    'area::coords': 0,
    'area::href': 1,
    'area::nohref': 0,
    'area::onblur': 2,
    'area::onfocus': 2,
    'area::shape': 0,
    'area::tabindex': 0,
    'area::target': 10,
    'audio::controls': 0,
    'audio::loop': 0,
    'audio::mediagroup': 5,
    'audio::muted': 0,
    'audio::preload': 0,
    'bdo::dir': 0,
    'blockquote::cite': 1,
    'br::clear': 0,
    'button::accesskey': 0,
    'button::disabled': 0,
    'button::name': 8,
    'button::onblur': 2,
    'button::onfocus': 2,
    'button::tabindex': 0,
    'button::type': 0,
    'button::value': 0,
    'canvas::height': 0,
    'canvas::width': 0,
    'caption::align': 0,
    'col::align': 0,
    'col::char': 0,
    'col::charoff': 0,
    'col::span': 0,
    'col::valign': 0,
    'col::width': 0,
    'colgroup::align': 0,
    'colgroup::char': 0,
    'colgroup::charoff': 0,
    'colgroup::span': 0,
    'colgroup::valign': 0,
    'colgroup::width': 0,
    'command::checked': 0,
    'command::command': 5,
    'command::disabled': 0,
    'command::icon': 1,
    'command::label': 0,
    'command::radiogroup': 0,
    'command::type': 0,
    'data::value': 0,
    'del::cite': 1,
    'del::datetime': 0,
    'details::open': 0,
    'dir::compact': 0,
    'div::align': 0,
    'dl::compact': 0,
    'fieldset::disabled': 0,
    'font::color': 0,
    'font::face': 0,
    'font::size': 0,
    'form::accept': 0,
    'form::action': 1,
    'form::autocomplete': 0,
    'form::enctype': 0,
    'form::method': 0,
    'form::name': 7,
    'form::novalidate': 0,
    'form::onreset': 2,
    'form::onsubmit': 2,
    'form::target': 10,
    'h1::align': 0,
    'h2::align': 0,
    'h3::align': 0,
    'h4::align': 0,
    'h5::align': 0,
    'h6::align': 0,
    'hr::align': 0,
    'hr::noshade': 0,
    'hr::size': 0,
    'hr::width': 0,
    'iframe::align': 0,
    'iframe::frameborder': 0,
    'iframe::height': 0,
    'iframe::marginheight': 0,
    'iframe::marginwidth': 0,
    'iframe::width': 0,
    'img::align': 0,
    'img::alt': 0,
    'img::border': 0,
    'img::height': 0,
    'img::hspace': 0,
    'img::ismap': 0,
    'img::name': 7,
    'img::src': 1,
    'img::usemap': 11,
    'img::vspace': 0,
    'img::width': 0,
    'input::accept': 0,
    'input::accesskey': 0,
    'input::align': 0,
    'input::alt': 0,
    'input::autocomplete': 0,
    'input::checked': 0,
    'input::disabled': 0,
    'input::inputmode': 0,
    'input::ismap': 0,
    'input::list': 5,
    'input::max': 0,
    'input::maxlength': 0,
    'input::min': 0,
    'input::multiple': 0,
    'input::name': 8,
    'input::onblur': 2,
    'input::onchange': 2,
    'input::onfocus': 2,
    'input::onselect': 2,
    'input::placeholder': 0,
    'input::readonly': 0,
    'input::required': 0,
    'input::size': 0,
    'input::src': 1,
    'input::step': 0,
    'input::tabindex': 0,
    'input::type': 0,
    'input::usemap': 11,
    'input::value': 0,
    'ins::cite': 1,
    'ins::datetime': 0,
    'label::accesskey': 0,
    'label::for': 5,
    'label::onblur': 2,
    'label::onfocus': 2,
    'legend::accesskey': 0,
    'legend::align': 0,
    'li::type': 0,
    'li::value': 0,
    'map::name': 7,
    'menu::compact': 0,
    'menu::label': 0,
    'menu::type': 0,
    'meter::high': 0,
    'meter::low': 0,
    'meter::max': 0,
    'meter::min': 0,
    'meter::value': 0,
    'ol::compact': 0,
    'ol::reversed': 0,
    'ol::start': 0,
    'ol::type': 0,
    'optgroup::disabled': 0,
    'optgroup::label': 0,
    'option::disabled': 0,
    'option::label': 0,
    'option::selected': 0,
    'option::value': 0,
    'output::for': 6,
    'output::name': 8,
    'p::align': 0,
    'pre::width': 0,
    'progress::max': 0,
    'progress::min': 0,
    'progress::value': 0,
    'q::cite': 1,
    'select::autocomplete': 0,
    'select::disabled': 0,
    'select::multiple': 0,
    'select::name': 8,
    'select::onblur': 2,
    'select::onchange': 2,
    'select::onfocus': 2,
    'select::required': 0,
    'select::size': 0,
    'select::tabindex': 0,
    'source::type': 0,
    'table::align': 0,
    'table::bgcolor': 0,
    'table::border': 0,
    'table::cellpadding': 0,
    'table::cellspacing': 0,
    'table::frame': 0,
    'table::rules': 0,
    'table::summary': 0,
    'table::width': 0,
    'tbody::align': 0,
    'tbody::char': 0,
    'tbody::charoff': 0,
    'tbody::valign': 0,
    'td::abbr': 0,
    'td::align': 0,
    'td::axis': 0,
    'td::bgcolor': 0,
    'td::char': 0,
    'td::charoff': 0,
    'td::colspan': 0,
    'td::headers': 6,
    'td::height': 0,
    'td::nowrap': 0,
    'td::rowspan': 0,
    'td::scope': 0,
    'td::valign': 0,
    'td::width': 0,
    'textarea::accesskey': 0,
    'textarea::autocomplete': 0,
    'textarea::cols': 0,
    'textarea::disabled': 0,
    'textarea::inputmode': 0,
    'textarea::name': 8,
    'textarea::onblur': 2,
    'textarea::onchange': 2,
    'textarea::onfocus': 2,
    'textarea::onselect': 2,
    'textarea::placeholder': 0,
    'textarea::readonly': 0,
    'textarea::required': 0,
    'textarea::rows': 0,
    'textarea::tabindex': 0,
    'textarea::wrap': 0,
    'tfoot::align': 0,
    'tfoot::char': 0,
    'tfoot::charoff': 0,
    'tfoot::valign': 0,
    'th::abbr': 0,
    'th::align': 0,
    'th::axis': 0,
    'th::bgcolor': 0,
    'th::char': 0,
    'th::charoff': 0,
    'th::colspan': 0,
    'th::headers': 6,
    'th::height': 0,
    'th::nowrap': 0,
    'th::rowspan': 0,
    'th::scope': 0,
    'th::valign': 0,
    'th::width': 0,
    'thead::align': 0,
    'thead::char': 0,
    'thead::charoff': 0,
    'thead::valign': 0,
    'tr::align': 0,
    'tr::bgcolor': 0,
    'tr::char': 0,
    'tr::charoff': 0,
    'tr::valign': 0,
    'track::default': 0,
    'track::kind': 0,
    'track::label': 0,
    'track::srclang': 0,
    'ul::compact': 0,
    'ul::type': 0,
    'video::controls': 0,
    'video::height': 0,
    'video::loop': 0,
    'video::mediagroup': 5,
    'video::muted': 0,
    'video::poster': 1,
    'video::preload': 0,
    'video::width': 0
};
html4['ATTRIBS'] = html4.ATTRIBS;
html4.eflags = {
    'OPTIONAL_ENDTAG': 1,
    'EMPTY': 2,
    'CDATA': 4,
    'RCDATA': 8,
    'UNSAFE': 16,
    'FOLDABLE': 32,
    'SCRIPT': 64,
    'STYLE': 128,
    'VIRTUALIZED': 256
};
html4['eflags'] = html4.eflags;
html4.ELEMENTS = {
    'a': 0,
    'abbr': 0,
    'acronym': 0,
    'address': 0,
    'applet': 272,
    'area': 2,
    'article': 0,
    'aside': 0,
    'audio': 0,
    'b': 0,
    'base': 274,
    'basefont': 274,
    'bdi': 0,
    'bdo': 0,
    'big': 0,
    'blockquote': 0,
    'body': 305,
    'br': 2,
    'button': 0,
    'canvas': 0,
    'caption': 0,
    'center': 0,
    'cite': 0,
    'code': 0,
    'col': 2,
    'colgroup': 1,
    'command': 2,
    'data': 0,
    'datalist': 0,
    'dd': 1,
    'del': 0,
    'details': 0,
    'dfn': 0,
    'dialog': 272,
    'dir': 0,
    'div': 0,
    'dl': 0,
    'dt': 1,
    'em': 0,
    'fieldset': 0,
    'figcaption': 0,
    'figure': 0,
    'font': 0,
    'footer': 0,
    'form': 0,
    'frame': 274,
    'frameset': 272,
    'h1': 0,
    'h2': 0,
    'h3': 0,
    'h4': 0,
    'h5': 0,
    'h6': 0,
    'head': 305,
    'header': 0,
    'hgroup': 0,
    'hr': 2,
    'html': 305,
    'i': 0,
    'iframe': 16,
    'img': 2,
    'input': 2,
    'ins': 0,
    'isindex': 274,
    'kbd': 0,
    'keygen': 274,
    'label': 0,
    'legend': 0,
    'li': 1,
    'link': 274,
    'map': 0,
    'mark': 0,
    'menu': 0,
    'meta': 274,
    'meter': 0,
    'nav': 0,
    'nobr': 0,
    'noembed': 276,
    'noframes': 276,
    'noscript': 276,
    'object': 272,
    'ol': 0,
    'optgroup': 0,
    'option': 1,
    'output': 0,
    'p': 1,
    'param': 274,
    'pre': 0,
    'progress': 0,
    'q': 0,
    's': 0,
    'samp': 0,
    'script': 84,
    'section': 0,
    'select': 0,
    'small': 0,
    'source': 2,
    'span': 0,
    'strike': 0,
    'strong': 0,
    'style': 148,
    'sub': 0,
    'summary': 0,
    'sup': 0,
    'table': 0,
    'tbody': 1,
    'td': 1,
    'textarea': 8,
    'tfoot': 1,
    'th': 1,
    'thead': 1,
    'time': 0,
    'title': 280,
    'tr': 1,
    'track': 2,
    'tt': 0,
    'u': 0,
    'ul': 0,
    'var': 0,
    'video': 0,
    'wbr': 2
};
html4['ELEMENTS'] = html4.ELEMENTS;
html4.ELEMENT_DOM_INTERFACES = {
    'a': 'HTMLAnchorElement',
    'abbr': 'HTMLElement',
    'acronym': 'HTMLElement',
    'address': 'HTMLElement',
    'applet': 'HTMLAppletElement',
    'area': 'HTMLAreaElement',
    'article': 'HTMLElement',
    'aside': 'HTMLElement',
    'audio': 'HTMLAudioElement',
    'b': 'HTMLElement',
    'base': 'HTMLBaseElement',
    'basefont': 'HTMLBaseFontElement',
    'bdi': 'HTMLElement',
    'bdo': 'HTMLElement',
    'big': 'HTMLElement',
    'blockquote': 'HTMLQuoteElement',
    'body': 'HTMLBodyElement',
    'br': 'HTMLBRElement',
    'button': 'HTMLButtonElement',
    'canvas': 'HTMLCanvasElement',
    'caption': 'HTMLTableCaptionElement',
    'center': 'HTMLElement',
    'cite': 'HTMLElement',
    'code': 'HTMLElement',
    'col': 'HTMLTableColElement',
    'colgroup': 'HTMLTableColElement',
    'command': 'HTMLCommandElement',
    'data': 'HTMLElement',
    'datalist': 'HTMLDataListElement',
    'dd': 'HTMLElement',
    'del': 'HTMLModElement',
    'details': 'HTMLDetailsElement',
    'dfn': 'HTMLElement',
    'dialog': 'HTMLDialogElement',
    'dir': 'HTMLDirectoryElement',
    'div': 'HTMLDivElement',
    'dl': 'HTMLDListElement',
    'dt': 'HTMLElement',
    'em': 'HTMLElement',
    'fieldset': 'HTMLFieldSetElement',
    'figcaption': 'HTMLElement',
    'figure': 'HTMLElement',
    'font': 'HTMLFontElement',
    'footer': 'HTMLElement',
    'form': 'HTMLFormElement',
    'frame': 'HTMLFrameElement',
    'frameset': 'HTMLFrameSetElement',
    'h1': 'HTMLHeadingElement',
    'h2': 'HTMLHeadingElement',
    'h3': 'HTMLHeadingElement',
    'h4': 'HTMLHeadingElement',
    'h5': 'HTMLHeadingElement',
    'h6': 'HTMLHeadingElement',
    'head': 'HTMLHeadElement',
    'header': 'HTMLElement',
    'hgroup': 'HTMLElement',
    'hr': 'HTMLHRElement',
    'html': 'HTMLHtmlElement',
    'i': 'HTMLElement',
    'iframe': 'HTMLIFrameElement',
    'img': 'HTMLImageElement',
    'input': 'HTMLInputElement',
    'ins': 'HTMLModElement',
    'isindex': 'HTMLUnknownElement',
    'kbd': 'HTMLElement',
    'keygen': 'HTMLKeygenElement',
    'label': 'HTMLLabelElement',
    'legend': 'HTMLLegendElement',
    'li': 'HTMLLIElement',
    'link': 'HTMLLinkElement',
    'map': 'HTMLMapElement',
    'mark': 'HTMLElement',
    'menu': 'HTMLMenuElement',
    'meta': 'HTMLMetaElement',
    'meter': 'HTMLMeterElement',
    'nav': 'HTMLElement',
    'nobr': 'HTMLElement',
    'noembed': 'HTMLElement',
    'noframes': 'HTMLElement',
    'noscript': 'HTMLElement',
    'object': 'HTMLObjectElement',
    'ol': 'HTMLOListElement',
    'optgroup': 'HTMLOptGroupElement',
    'option': 'HTMLOptionElement',
    'output': 'HTMLOutputElement',
    'p': 'HTMLParagraphElement',
    'param': 'HTMLParamElement',
    'pre': 'HTMLPreElement',
    'progress': 'HTMLProgressElement',
    'q': 'HTMLQuoteElement',
    's': 'HTMLElement',
    'samp': 'HTMLElement',
    'script': 'HTMLScriptElement',
    'section': 'HTMLElement',
    'select': 'HTMLSelectElement',
    'small': 'HTMLElement',
    'source': 'HTMLSourceElement',
    'span': 'HTMLSpanElement',
    'strike': 'HTMLElement',
    'strong': 'HTMLElement',
    'style': 'HTMLStyleElement',
    'sub': 'HTMLElement',
    'summary': 'HTMLElement',
    'sup': 'HTMLElement',
    'table': 'HTMLTableElement',
    'tbody': 'HTMLTableSectionElement',
    'td': 'HTMLTableDataCellElement',
    'textarea': 'HTMLTextAreaElement',
    'tfoot': 'HTMLTableSectionElement',
    'th': 'HTMLTableHeaderCellElement',
    'thead': 'HTMLTableSectionElement',
    'time': 'HTMLTimeElement',
    'title': 'HTMLTitleElement',
    'tr': 'HTMLTableRowElement',
    'track': 'HTMLTrackElement',
    'tt': 'HTMLElement',
    'u': 'HTMLElement',
    'ul': 'HTMLUListElement',
    'var': 'HTMLElement',
    'video': 'HTMLVideoElement',
    'wbr': 'HTMLElement'
};
html4['ELEMENT_DOM_INTERFACES'] = html4.ELEMENT_DOM_INTERFACES;
html4.ueffects = {
    'NOT_LOADED': 0,
    'SAME_DOCUMENT': 1,
    'NEW_DOCUMENT': 2
};
html4['ueffects'] = html4.ueffects;
html4.URIEFFECTS = {
    'a::href': 2,
    'area::href': 2,
    'blockquote::cite': 0,
    'command::icon': 1,
    'del::cite': 0,
    'form::action': 2,
    'img::src': 1,
    'input::src': 1,
    'ins::cite': 0,
    'q::cite': 0,
    'video::poster': 1
};
html4['URIEFFECTS'] = html4.URIEFFECTS;
html4.ltypes = {
    'UNSANDBOXED': 2,
    'SANDBOXED': 1,
    'DATA': 0
};
html4['ltypes'] = html4.ltypes;
html4.LOADERTYPES = {
    'a::href': 2,
    'area::href': 2,
    'blockquote::cite': 2,
    'command::icon': 1,
    'del::cite': 2,
    'form::action': 2,
    'img::src': 1,
    'input::src': 1,
    'ins::cite': 2,
    'q::cite': 2,
    'video::poster': 1
};
html4['LOADERTYPES'] = html4.LOADERTYPES;
if ('I'.toLowerCase() !== 'i') {
    throw 'I/i problem';
}
var html = function (html4) {
    var parseCssDeclarations, sanitizeCssProperty, cssSchema;
    if ('undefined' !== typeof window) {
        parseCssDeclarations = window['parseCssDeclarations'];
        sanitizeCssProperty = window['sanitizeCssProperty'];
        cssSchema = window['cssSchema'];
    }
    var ENTITIES = {
        'lt': '<',
        'LT': '<',
        'gt': '>',
        'GT': '>',
        'amp': '&',
        'AMP': '&',
        'quot': '"',
        'apos': '\'',
        'nbsp': '\xA0'
    };
    var decimalEscapeRe = /^#(\d+)$/;
    var hexEscapeRe = /^#x([0-9A-Fa-f]+)$/;
    var safeEntityNameRe = /^[A-Za-z][A-za-z0-9]+$/;
    var entityLookupElement = 'undefined' !== typeof window && window['document'] ? window['document'].createElement('textarea') : null;
    function lookupEntity(name) {
        if (ENTITIES.hasOwnProperty(name)) {
            return ENTITIES[name];
        }
        var m = name.match(decimalEscapeRe);
        if (m) {
            return String.fromCharCode(parseInt(m[1], 10));
        } else if (!!(m = name.match(hexEscapeRe))) {
            return String.fromCharCode(parseInt(m[1], 16));
        } else if (entityLookupElement && safeEntityNameRe.test(name)) {
            entityLookupElement.innerHTML = '&' + name + ';';
            var text = entityLookupElement.textContent;
            ENTITIES[name] = text;
            return text;
        } else {
            return '&' + name + ';';
        }
    }
    function decodeOneEntity(_, name) {
        return lookupEntity(name);
    }
    var nulRe = /\0/g;
    function stripNULs(s) {
        return s.replace(nulRe, '');
    }
    var ENTITY_RE_1 = /&(#[0-9]+|#[xX][0-9A-Fa-f]+|\w+);/g;
    var ENTITY_RE_2 = /^(#[0-9]+|#[xX][0-9A-Fa-f]+|\w+);/;
    function unescapeEntities(s) {
        return s.replace(ENTITY_RE_1, decodeOneEntity);
    }
    var ampRe = /&/g;
    var looseAmpRe = /&([^a-z#]|#(?:[^0-9x]|x(?:[^0-9a-f]|$)|$)|$)/gi;
    var ltRe = /[<]/g;
    var gtRe = />/g;
    var quotRe = /\"/g;
    function escapeAttrib(s) {
        return ('' + s).replace(ampRe, '&amp;').replace(ltRe, '&lt;').replace(gtRe, '&gt;').replace(quotRe, '&#34;');
    }
    function normalizeRCData(rcdata) {
        return rcdata.replace(looseAmpRe, '&amp;$1').replace(ltRe, '&lt;').replace(gtRe, '&gt;');
    }
    var ATTR_RE = new RegExp('^\\s*' + '([-.:\\w]+)' + '(?:' + ('\\s*(=)\\s*' + '(' + ('(")[^"]*("|$)' + '|' + '(\')[^\']*(\'|$)' + '|' + '(?=[a-z][-\\w]*\\s*=)' + '|' + '[^"\'\\s]*') + ')') + ')?', 'i');
    var splitWillCapture = 'a,b'.split(/(,)/).length === 3;
    var EFLAGS_TEXT = html4.eflags['CDATA'] | html4.eflags['RCDATA'];
    function makeSaxParser(handler) {
        var hcopy = {
            cdata: handler.cdata || handler['cdata'],
            comment: handler.comment || handler['comment'],
            endDoc: handler.endDoc || handler['endDoc'],
            endTag: handler.endTag || handler['endTag'],
            pcdata: handler.pcdata || handler['pcdata'],
            rcdata: handler.rcdata || handler['rcdata'],
            startDoc: handler.startDoc || handler['startDoc'],
            startTag: handler.startTag || handler['startTag']
        };
        return function (htmlText, param) {
            return parse(htmlText, hcopy, param);
        };
    }
    var continuationMarker = {};
    function parse(htmlText, handler, param) {
        var m, p, tagName;
        var parts = htmlSplit(htmlText);
        var state = {
            noMoreGT: false,
            noMoreEndComments: false
        };
        parseCPS(handler, parts, 0, state, param);
    }
    function continuationMaker(h, parts, initial, state, param) {
        return function () {
            parseCPS(h, parts, initial, state, param);
        };
    }
    function parseCPS(h, parts, initial, state, param) {
        try {
            if (h.startDoc && initial == 0) {
                h.startDoc(param);
            }
            var m, p, tagName;
            for (var pos = initial, end = parts.length; pos < end;) {
                var current = parts[pos++];
                var next = parts[pos];
                switch (current) {
                case '&':
                    if (ENTITY_RE_2.test(next)) {
                        if (h.pcdata) {
                            h.pcdata('&' + next, param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                        }
                        pos++;
                    } else {
                        if (h.pcdata) {
                            h.pcdata('&amp;', param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                        }
                    }
                    break;
                case '</':
                    if (m = /^([-\w:]+)[^\'\"]*/.exec(next)) {
                        if (m[0].length === next.length && parts[pos + 1] === '>') {
                            pos += 2;
                            tagName = m[1].toLowerCase();
                            if (h.endTag) {
                                h.endTag(tagName, param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                            }
                        } else {
                            pos = parseEndTag(parts, pos, h, param, continuationMarker, state);
                        }
                    } else {
                        if (h.pcdata) {
                            h.pcdata('&lt;/', param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                        }
                    }
                    break;
                case '<':
                    if (m = /^([-\w:]+)\s*\/?/.exec(next)) {
                        if (m[0].length === next.length && parts[pos + 1] === '>') {
                            pos += 2;
                            tagName = m[1].toLowerCase();
                            if (h.startTag) {
                                h.startTag(tagName, [], param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                            }
                            var eflags = html4.ELEMENTS[tagName];
                            if (eflags & EFLAGS_TEXT) {
                                var tag = {
                                    name: tagName,
                                    next: pos,
                                    eflags: eflags
                                };
                                pos = parseText(parts, tag, h, param, continuationMarker, state);
                            }
                        } else {
                            pos = parseStartTag(parts, pos, h, param, continuationMarker, state);
                        }
                    } else {
                        if (h.pcdata) {
                            h.pcdata('&lt;', param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                        }
                    }
                    break;
                case '<!--':
                    if (!state.noMoreEndComments) {
                        for (p = pos + 1; p < end; p++) {
                            if (parts[p] === '>' && /--$/.test(parts[p - 1])) {
                                break;
                            }
                        }
                        if (p < end) {
                            if (h.comment) {
                                var comment = parts.slice(pos, p).join('');
                                h.comment(comment.substr(0, comment.length - 2), param, continuationMarker, continuationMaker(h, parts, p + 1, state, param));
                            }
                            pos = p + 1;
                        } else {
                            state.noMoreEndComments = true;
                        }
                    }
                    if (state.noMoreEndComments) {
                        if (h.pcdata) {
                            h.pcdata('&lt;!--', param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                        }
                    }
                    break;
                case '<!':
                    if (!/^\w/.test(next)) {
                        if (h.pcdata) {
                            h.pcdata('&lt;!', param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                        }
                    } else {
                        if (!state.noMoreGT) {
                            for (p = pos + 1; p < end; p++) {
                                if (parts[p] === '>') {
                                    break;
                                }
                            }
                            if (p < end) {
                                pos = p + 1;
                            } else {
                                state.noMoreGT = true;
                            }
                        }
                        if (state.noMoreGT) {
                            if (h.pcdata) {
                                h.pcdata('&lt;!', param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                            }
                        }
                    }
                    break;
                case '<?':
                    if (!state.noMoreGT) {
                        for (p = pos + 1; p < end; p++) {
                            if (parts[p] === '>') {
                                break;
                            }
                        }
                        if (p < end) {
                            pos = p + 1;
                        } else {
                            state.noMoreGT = true;
                        }
                    }
                    if (state.noMoreGT) {
                        if (h.pcdata) {
                            h.pcdata('&lt;?', param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                        }
                    }
                    break;
                case '>':
                    if (h.pcdata) {
                        h.pcdata('&gt;', param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                    }
                    break;
                case '':
                    break;
                default:
                    if (h.pcdata) {
                        h.pcdata(current, param, continuationMarker, continuationMaker(h, parts, pos, state, param));
                    }
                    break;
                }
            }
            if (h.endDoc) {
                h.endDoc(param);
            }
        } catch (e) {
            if (e !== continuationMarker) {
                throw e;
            }
        }
    }
    function htmlSplit(str) {
        var re = /(<\/|<\!--|<[!?]|[&<>])/g;
        str += '';
        if (splitWillCapture) {
            return str.split(re);
        } else {
            var parts = [];
            var lastPos = 0;
            var m;
            while ((m = re.exec(str)) !== null) {
                parts.push(str.substring(lastPos, m.index));
                parts.push(m[0]);
                lastPos = m.index + m[0].length;
            }
            parts.push(str.substring(lastPos));
            return parts;
        }
    }
    function parseEndTag(parts, pos, h, param, continuationMarker, state) {
        var tag = parseTagAndAttrs(parts, pos);
        if (!tag) {
            return parts.length;
        }
        if (h.endTag) {
            h.endTag(tag.name, param, continuationMarker, continuationMaker(h, parts, pos, state, param));
        }
        return tag.next;
    }
    function parseStartTag(parts, pos, h, param, continuationMarker, state) {
        var tag = parseTagAndAttrs(parts, pos);
        if (!tag) {
            return parts.length;
        }
        if (h.startTag) {
            h.startTag(tag.name, tag.attrs, param, continuationMarker, continuationMaker(h, parts, tag.next, state, param));
        }
        if (tag.eflags & EFLAGS_TEXT) {
            return parseText(parts, tag, h, param, continuationMarker, state);
        } else {
            return tag.next;
        }
    }
    var endTagRe = {};
    function parseText(parts, tag, h, param, continuationMarker, state) {
        var end = parts.length;
        if (!endTagRe.hasOwnProperty(tag.name)) {
            endTagRe[tag.name] = new RegExp('^' + tag.name + '(?:[\\s\\/]|$)', 'i');
        }
        var re = endTagRe[tag.name];
        var first = tag.next;
        var p = tag.next + 1;
        for (; p < end; p++) {
            if (parts[p - 1] === '</' && re.test(parts[p])) {
                break;
            }
        }
        if (p < end) {
            p -= 1;
        }
        var buf = parts.slice(first, p).join('');
        if (tag.eflags & html4.eflags['CDATA']) {
            if (h.cdata) {
                h.cdata(buf, param, continuationMarker, continuationMaker(h, parts, p, state, param));
            }
        } else if (tag.eflags & html4.eflags['RCDATA']) {
            if (h.rcdata) {
                h.rcdata(normalizeRCData(buf), param, continuationMarker, continuationMaker(h, parts, p, state, param));
            }
        } else {
            throw new Error('bug');
        }
        return p;
    }
    function parseTagAndAttrs(parts, pos) {
        var m = /^([-\w:]+)/.exec(parts[pos]);
        var tag = {};
        tag.name = m[1].toLowerCase();
        tag.eflags = html4.ELEMENTS[tag.name];
        var buf = parts[pos].substr(m[0].length);
        var p = pos + 1;
        var end = parts.length;
        for (; p < end; p++) {
            if (parts[p] === '>') {
                break;
            }
            buf += parts[p];
        }
        if (end <= p) {
            return void 0;
        }
        var attrs = [];
        while (buf !== '') {
            m = ATTR_RE.exec(buf);
            if (!m) {
                buf = buf.replace(/^[\s\S][^a-z\s]*/, '');
            } else if (m[4] && !m[5] || m[6] && !m[7]) {
                var quote = m[4] || m[6];
                var sawQuote = false;
                var abuf = [
                    buf,
                    parts[p++]
                ];
                for (; p < end; p++) {
                    if (sawQuote) {
                        if (parts[p] === '>') {
                            break;
                        }
                    } else if (0 <= parts[p].indexOf(quote)) {
                        sawQuote = true;
                    }
                    abuf.push(parts[p]);
                }
                if (end <= p) {
                    break;
                }
                buf = abuf.join('');
                continue;
            } else {
                var aName = m[1].toLowerCase();
                var aValue = m[2] ? decodeValue(m[3]) : '';
                attrs.push(aName, aValue);
                buf = buf.substr(m[0].length);
            }
        }
        tag.attrs = attrs;
        tag.next = p + 1;
        return tag;
    }
    function decodeValue(v) {
        var q = v.charCodeAt(0);
        if (q === 34 || q === 39) {
            v = v.substr(1, v.length - 2);
        }
        return unescapeEntities(stripNULs(v));
    }
    function makeHtmlSanitizer(tagPolicy) {
        var stack;
        var ignoring;
        var emit = function (text, out) {
            if (!ignoring) {
                out.push(text);
            }
        };
        return makeSaxParser({
            'startDoc': function (_) {
                stack = [];
                ignoring = false;
            },
            'startTag': function (tagNameOrig, attribs, out) {
                if (ignoring) {
                    return;
                }
                if (!html4.ELEMENTS.hasOwnProperty(tagNameOrig)) {
                    return;
                }
                var eflagsOrig = html4.ELEMENTS[tagNameOrig];
                if (eflagsOrig & html4.eflags['FOLDABLE']) {
                    return;
                }
                var decision = tagPolicy(tagNameOrig, attribs);
                if (!decision) {
                    ignoring = !(eflagsOrig & html4.eflags['EMPTY']);
                    return;
                } else if (typeof decision !== 'object') {
                    throw new Error('tagPolicy did not return object (old API?)');
                }
                if ('attribs' in decision) {
                    attribs = decision['attribs'];
                } else {
                    throw new Error('tagPolicy gave no attribs');
                }
                var eflagsRep;
                var tagNameRep;
                if ('tagName' in decision) {
                    tagNameRep = decision['tagName'];
                    eflagsRep = html4.ELEMENTS[tagNameRep];
                } else {
                    tagNameRep = tagNameOrig;
                    eflagsRep = eflagsOrig;
                }
                if (eflagsOrig & html4.eflags['OPTIONAL_ENDTAG']) {
                    var onStack = stack[stack.length - 1];
                    if (onStack && onStack.orig === tagNameOrig && (onStack.rep !== tagNameRep || tagNameOrig !== tagNameRep)) {
                        out.push('</', onStack.rep, '>');
                    }
                }
                if (!(eflagsOrig & html4.eflags['EMPTY'])) {
                    stack.push({
                        orig: tagNameOrig,
                        rep: tagNameRep
                    });
                }
                out.push('<', tagNameRep);
                for (var i = 0, n = attribs.length; i < n; i += 2) {
                    var attribName = attribs[i], value = attribs[i + 1];
                    if (value !== null && value !== void 0) {
                        out.push(' ', attribName, '="', escapeAttrib(value), '"');
                    }
                }
                out.push('>');
                if (eflagsOrig & html4.eflags['EMPTY'] && !(eflagsRep & html4.eflags['EMPTY'])) {
                    out.push('</', tagNameRep, '>');
                }
            },
            'endTag': function (tagName, out) {
                if (ignoring) {
                    ignoring = false;
                    return;
                }
                if (!html4.ELEMENTS.hasOwnProperty(tagName)) {
                    return;
                }
                var eflags = html4.ELEMENTS[tagName];
                if (!(eflags & (html4.eflags['EMPTY'] | html4.eflags['FOLDABLE']))) {
                    var index;
                    if (eflags & html4.eflags['OPTIONAL_ENDTAG']) {
                        for (index = stack.length; --index >= 0;) {
                            var stackElOrigTag = stack[index].orig;
                            if (stackElOrigTag === tagName) {
                                break;
                            }
                            if (!(html4.ELEMENTS[stackElOrigTag] & html4.eflags['OPTIONAL_ENDTAG'])) {
                                return;
                            }
                        }
                    } else {
                        for (index = stack.length; --index >= 0;) {
                            if (stack[index].orig === tagName) {
                                break;
                            }
                        }
                    }
                    if (index < 0) {
                        return;
                    }
                    for (var i = stack.length; --i > index;) {
                        var stackElRepTag = stack[i].rep;
                        if (!(html4.ELEMENTS[stackElRepTag] & html4.eflags['OPTIONAL_ENDTAG'])) {
                            out.push('</', stackElRepTag, '>');
                        }
                    }
                    if (index < stack.length) {
                        tagName = stack[index].rep;
                    }
                    stack.length = index;
                    out.push('</', tagName, '>');
                }
            },
            'pcdata': emit,
            'rcdata': emit,
            'cdata': emit,
            'endDoc': function (out) {
                for (; stack.length; stack.length--) {
                    out.push('</', stack[stack.length - 1].rep, '>');
                }
            }
        });
    }
    var ALLOWED_URI_SCHEMES = /^(?:https?|mailto|data)$/i;
    function safeUri(uri, effect, ltype, hints, naiveUriRewriter) {
        if (!naiveUriRewriter) {
            return null;
        }
        try {
            var parsed = URI.parse('' + uri);
            if (parsed) {
                if (!parsed.hasScheme() || ALLOWED_URI_SCHEMES.test(parsed.getScheme())) {
                    var safe = naiveUriRewriter(parsed, effect, ltype, hints);
                    return safe ? safe.toString() : null;
                }
            }
        } catch (e) {
            return null;
        }
        return null;
    }
    function log(logger, tagName, attribName, oldValue, newValue) {
        if (!attribName) {
            logger(tagName + ' removed', {
                change: 'removed',
                tagName: tagName
            });
        }
        if (oldValue !== newValue) {
            var changed = 'changed';
            if (oldValue && !newValue) {
                changed = 'removed';
            } else if (!oldValue && newValue) {
                changed = 'added';
            }
            logger(tagName + '.' + attribName + ' ' + changed, {
                change: changed,
                tagName: tagName,
                attribName: attribName,
                oldValue: oldValue,
                newValue: newValue
            });
        }
    }
    function lookupAttribute(map, tagName, attribName) {
        var attribKey;
        attribKey = tagName + '::' + attribName;
        if (map.hasOwnProperty(attribKey)) {
            return map[attribKey];
        }
        attribKey = '*::' + attribName;
        if (map.hasOwnProperty(attribKey)) {
            return map[attribKey];
        }
        return void 0;
    }
    function getAttributeType(tagName, attribName) {
        return lookupAttribute(html4.ATTRIBS, tagName, attribName);
    }
    function getLoaderType(tagName, attribName) {
        return lookupAttribute(html4.LOADERTYPES, tagName, attribName);
    }
    function getUriEffect(tagName, attribName) {
        return lookupAttribute(html4.URIEFFECTS, tagName, attribName);
    }
    function sanitizeAttribs(tagName, attribs, opt_naiveUriRewriter, opt_nmTokenPolicy, opt_logger) {
        for (var i = 0; i < attribs.length; i += 2) {
            var attribName = attribs[i];
            var value = attribs[i + 1];
            var oldValue = value;
            var atype = null, attribKey;
            if ((attribKey = tagName + '::' + attribName, html4.ATTRIBS.hasOwnProperty(attribKey)) || (attribKey = '*::' + attribName, html4.ATTRIBS.hasOwnProperty(attribKey))) {
                atype = html4.ATTRIBS[attribKey];
            }
            if (atype !== null) {
                switch (atype) {
                case html4.atype['NONE']:
                    break;
                case html4.atype['SCRIPT']:
                    value = null;
                    if (opt_logger) {
                        log(opt_logger, tagName, attribName, oldValue, value);
                    }
                    break;
                case html4.atype['STYLE']:
                    if ('undefined' === typeof parseCssDeclarations) {
                        value = null;
                        if (opt_logger) {
                            log(opt_logger, tagName, attribName, oldValue, value);
                        }
                        break;
                    }
                    var sanitizedDeclarations = [];
                    parseCssDeclarations(value, {
                        declaration: function (property, tokens) {
                            var normProp = property.toLowerCase();
                            var schema = cssSchema[normProp];
                            if (!schema) {
                                return;
                            }
                            sanitizeCssProperty(normProp, schema, tokens, opt_naiveUriRewriter ? function (url) {
                                return safeUri(url, html4.ueffects.SAME_DOCUMENT, html4.ltypes.SANDBOXED, {
                                    'TYPE': 'CSS',
                                    'CSS_PROP': normProp
                                }, opt_naiveUriRewriter);
                            } : null);
                            sanitizedDeclarations.push(property + ': ' + tokens.join(' '));
                        }
                    });
                    value = sanitizedDeclarations.length > 0 ? sanitizedDeclarations.join(' ; ') : null;
                    if (opt_logger) {
                        log(opt_logger, tagName, attribName, oldValue, value);
                    }
                    break;
                case html4.atype['ID']:
                case html4.atype['IDREF']:
                case html4.atype['IDREFS']:
                case html4.atype['GLOBAL_NAME']:
                case html4.atype['LOCAL_NAME']:
                case html4.atype['CLASSES']:
                    value = opt_nmTokenPolicy ? opt_nmTokenPolicy(value) : value;
                    if (opt_logger) {
                        log(opt_logger, tagName, attribName, oldValue, value);
                    }
                    break;
                case html4.atype['URI']:
                    value = safeUri(value, getUriEffect(tagName, attribName), getLoaderType(tagName, attribName), {
                        'TYPE': 'MARKUP',
                        'XML_ATTR': attribName,
                        'XML_TAG': tagName
                    }, opt_naiveUriRewriter);
                    if (opt_logger) {
                        log(opt_logger, tagName, attribName, oldValue, value);
                    }
                    break;
                case html4.atype['URI_FRAGMENT']:
                    if (value && '#' === value.charAt(0)) {
                        value = value.substring(1);
                        value = opt_nmTokenPolicy ? opt_nmTokenPolicy(value) : value;
                        if (value !== null && value !== void 0) {
                            value = '#' + value;
                        }
                    } else {
                        value = null;
                    }
                    if (opt_logger) {
                        log(opt_logger, tagName, attribName, oldValue, value);
                    }
                    break;
                default:
                    value = null;
                    if (opt_logger) {
                        log(opt_logger, tagName, attribName, oldValue, value);
                    }
                    break;
                }
            } else {
                value = null;
                if (opt_logger) {
                    log(opt_logger, tagName, attribName, oldValue, value);
                }
            }
            attribs[i + 1] = value;
        }
        return attribs;
    }
    function makeTagPolicy(opt_naiveUriRewriter, opt_nmTokenPolicy, opt_logger) {
        return function (tagName, attribs) {
            if (!(html4.ELEMENTS[tagName] & html4.eflags['UNSAFE'])) {
                return { 'attribs': sanitizeAttribs(tagName, attribs, opt_naiveUriRewriter, opt_nmTokenPolicy, opt_logger) };
            } else {
                if (opt_logger) {
                    log(opt_logger, tagName, undefined, undefined, undefined);
                }
            }
        };
    }
    function sanitizeWithPolicy(inputHtml, tagPolicy) {
        var outputArray = [];
        makeHtmlSanitizer(tagPolicy)(inputHtml, outputArray);
        return outputArray.join('');
    }
    function sanitize(inputHtml, opt_naiveUriRewriter, opt_nmTokenPolicy, opt_logger) {
        var tagPolicy = makeTagPolicy(opt_naiveUriRewriter, opt_nmTokenPolicy, opt_logger);
        return sanitizeWithPolicy(inputHtml, tagPolicy);
    }
    var html = {};
    html.escapeAttrib = html['escapeAttrib'] = escapeAttrib;
    html.makeHtmlSanitizer = html['makeHtmlSanitizer'] = makeHtmlSanitizer;
    html.makeSaxParser = html['makeSaxParser'] = makeSaxParser;
    html.makeTagPolicy = html['makeTagPolicy'] = makeTagPolicy;
    html.normalizeRCData = html['normalizeRCData'] = normalizeRCData;
    html.sanitize = html['sanitize'] = sanitize;
    html.sanitizeAttribs = html['sanitizeAttribs'] = sanitizeAttribs;
    html.sanitizeWithPolicy = html['sanitizeWithPolicy'] = sanitizeWithPolicy;
    html.unescapeEntities = html['unescapeEntities'] = unescapeEntities;
    return html;
}(html4);
var html_sanitize = html['sanitize'];
html4.ATTRIBS['*::style'] = 0;
html4.ELEMENTS['style'] = 0;
html4.ATTRIBS['a::target'] = 0;
html4.ELEMENTS['video'] = 0;
html4.ATTRIBS['video::src'] = 0;
html4.ATTRIBS['video::poster'] = 0;
html4.ATTRIBS['video::controls'] = 0;
html4.ELEMENTS['audio'] = 0;
html4.ATTRIBS['audio::src'] = 0;
html4.ATTRIBS['video::autoplay'] = 0;
html4.ATTRIBS['video::controls'] = 0;
if (typeof module !== 'undefined') {
    module.exports = html_sanitize;
}
define('sanitizeCaja', [], function () {
    return;
});
!function (e) {
    if ('object' == typeof exports && 'undefined' != typeof module)
        module.exports = e();
    else if ('function' == typeof define && define.amd)
        define('MarkdownIt', [], e);
    else {
        var r;
        r = 'undefined' != typeof window ? window : 'undefined' != typeof global ? global : 'undefined' != typeof self ? self : this, r.markdownit = e();
    }
}(function () {
    var e;
    return function r(e, t, n) {
        function s(i, a) {
            if (!t[i]) {
                if (!e[i]) {
                    var c = 'function' == typeof require && require;
                    if (!a && c)
                        return c(i, !0);
                    if (o)
                        return o(i, !0);
                    var l = new Error('Cannot find module \'' + i + '\'');
                    throw l.code = 'MODULE_NOT_FOUND', l;
                }
                var u = t[i] = { exports: {} };
                e[i][0].call(u.exports, function (r) {
                    var t = e[i][1][r];
                    return s(t ? t : r);
                }, u, u.exports, r, e, t, n);
            }
            return t[i].exports;
        }
        for (var o = 'function' == typeof require && require, i = 0; i < n.length; i++)
            s(n[i]);
        return s;
    }({
        1: [
            function (e, r, t) {
                'use strict';
                r.exports = e('entities/maps/entities.json');
            },
            { 'entities/maps/entities.json': 54 }
        ],
        2: [
            function (e, r, t) {
                'use strict';
                r.exports = [
                    'address',
                    'article',
                    'aside',
                    'base',
                    'basefont',
                    'blockquote',
                    'body',
                    'caption',
                    'center',
                    'col',
                    'colgroup',
                    'dd',
                    'details',
                    'dialog',
                    'dir',
                    'div',
                    'dl',
                    'dt',
                    'fieldset',
                    'figcaption',
                    'figure',
                    'footer',
                    'form',
                    'frame',
                    'frameset',
                    'h1',
                    'head',
                    'header',
                    'hr',
                    'html',
                    'iframe',
                    'legend',
                    'li',
                    'link',
                    'main',
                    'menu',
                    'menuitem',
                    'meta',
                    'nav',
                    'noframes',
                    'ol',
                    'optgroup',
                    'option',
                    'p',
                    'param',
                    'pre',
                    'section',
                    'source',
                    'title',
                    'summary',
                    'table',
                    'tbody',
                    'td',
                    'tfoot',
                    'th',
                    'thead',
                    'title',
                    'tr',
                    'track',
                    'ul'
                ];
            },
            {}
        ],
        3: [
            function (e, r, t) {
                'use strict';
                var n = '[a-zA-Z_:][a-zA-Z0-9:._-]*', s = '[^"\'=<>`\\x00-\\x20]+', o = '\'[^\']*\'', i = '"[^"]*"', a = '(?:' + s + '|' + o + '|' + i + ')', c = '(?:\\s+' + n + '(?:\\s*=\\s*' + a + ')?)', l = '<[A-Za-z][A-Za-z0-9\\-]*' + c + '*\\s*\\/?>', u = '<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>', p = '<!---->|<!--(?:-?[^>-])(?:-?[^-])*-->', h = '<[?].*?[?]>', f = '<![A-Z]+\\s+[^>]*>', d = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>', m = new RegExp('^(?:' + l + '|' + u + '|' + p + '|' + h + '|' + f + '|' + d + ')'), g = new RegExp('^(?:' + l + '|' + u + ')');
                r.exports.HTML_TAG_RE = m, r.exports.HTML_OPEN_CLOSE_TAG_RE = g;
            },
            {}
        ],
        4: [
            function (e, r, t) {
                'use strict';
                r.exports = [
                    'coap',
                    'doi',
                    'javascript',
                    'aaa',
                    'aaas',
                    'about',
                    'acap',
                    'cap',
                    'cid',
                    'crid',
                    'data',
                    'dav',
                    'dict',
                    'dns',
                    'file',
                    'ftp',
                    'geo',
                    'go',
                    'gopher',
                    'h323',
                    'http',
                    'https',
                    'iax',
                    'icap',
                    'im',
                    'imap',
                    'info',
                    'ipp',
                    'iris',
                    'iris.beep',
                    'iris.xpc',
                    'iris.xpcs',
                    'iris.lwz',
                    'ldap',
                    'mailto',
                    'mid',
                    'msrp',
                    'msrps',
                    'mtqp',
                    'mupdate',
                    'news',
                    'nfs',
                    'ni',
                    'nih',
                    'nntp',
                    'opaquelocktoken',
                    'pop',
                    'pres',
                    'rtsp',
                    'service',
                    'session',
                    'shttp',
                    'sieve',
                    'sip',
                    'sips',
                    'sms',
                    'snmp',
                    'soap.beep',
                    'soap.beeps',
                    'tag',
                    'tel',
                    'telnet',
                    'tftp',
                    'thismessage',
                    'tn3270',
                    'tip',
                    'tv',
                    'urn',
                    'vemmi',
                    'ws',
                    'wss',
                    'xcon',
                    'xcon-userid',
                    'xmlrpc.beep',
                    'xmlrpc.beeps',
                    'xmpp',
                    'z39.50r',
                    'z39.50s',
                    'adiumxtra',
                    'afp',
                    'afs',
                    'aim',
                    'apt',
                    'attachment',
                    'aw',
                    'beshare',
                    'bitcoin',
                    'bolo',
                    'callto',
                    'chrome',
                    'chrome-extension',
                    'com-eventbrite-attendee',
                    'content',
                    'cvs',
                    'dlna-playsingle',
                    'dlna-playcontainer',
                    'dtn',
                    'dvb',
                    'ed2k',
                    'facetime',
                    'feed',
                    'finger',
                    'fish',
                    'gg',
                    'git',
                    'gizmoproject',
                    'gtalk',
                    'hcp',
                    'icon',
                    'ipn',
                    'irc',
                    'irc6',
                    'ircs',
                    'itms',
                    'jar',
                    'jms',
                    'keyparc',
                    'lastfm',
                    'ldaps',
                    'magnet',
                    'maps',
                    'market',
                    'message',
                    'mms',
                    'ms-help',
                    'msnim',
                    'mumble',
                    'mvn',
                    'notes',
                    'oid',
                    'palm',
                    'paparazzi',
                    'platform',
                    'proxy',
                    'psyc',
                    'query',
                    'res',
                    'resource',
                    'rmi',
                    'rsync',
                    'rtmp',
                    'secondlife',
                    'sftp',
                    'sgn',
                    'skype',
                    'smb',
                    'soldat',
                    'spotify',
                    'ssh',
                    'steam',
                    'svn',
                    'teamspeak',
                    'things',
                    'udp',
                    'unreal',
                    'ut2004',
                    'ventrilo',
                    'view-source',
                    'webcal',
                    'wtai',
                    'wyciwyg',
                    'xfire',
                    'xri',
                    'ymsgr'
                ];
            },
            {}
        ],
        5: [
            function (e, r, t) {
                'use strict';
                function n(e) {
                    return Object.prototype.toString.call(e);
                }
                function s(e) {
                    return '[object String]' === n(e);
                }
                function o(e, r) {
                    return x.call(e, r);
                }
                function i(e) {
                    var r = Array.prototype.slice.call(arguments, 1);
                    return r.forEach(function (r) {
                        if (r) {
                            if ('object' != typeof r)
                                throw new TypeError(r + 'must be object');
                            Object.keys(r).forEach(function (t) {
                                e[t] = r[t];
                            });
                        }
                    }), e;
                }
                function a(e, r, t) {
                    return [].concat(e.slice(0, r), t, e.slice(r + 1));
                }
                function c(e) {
                    return e >= 55296 && 57343 >= e ? !1 : e >= 64976 && 65007 >= e ? !1 : 65535 === (65535 & e) || 65534 === (65535 & e) ? !1 : e >= 0 && 8 >= e ? !1 : 11 === e ? !1 : e >= 14 && 31 >= e ? !1 : e >= 127 && 159 >= e ? !1 : e > 1114111 ? !1 : !0;
                }
                function l(e) {
                    if (e > 65535) {
                        e -= 65536;
                        var r = 55296 + (e >> 10), t = 56320 + (1023 & e);
                        return String.fromCharCode(r, t);
                    }
                    return String.fromCharCode(e);
                }
                function u(e, r) {
                    var t = 0;
                    return o(q, r) ? q[r] : 35 === r.charCodeAt(0) && w.test(r) && (t = 'x' === r[1].toLowerCase() ? parseInt(r.slice(2), 16) : parseInt(r.slice(1), 10), c(t)) ? l(t) : e;
                }
                function p(e) {
                    return e.indexOf('\\') < 0 ? e : e.replace(y, '$1');
                }
                function h(e) {
                    return e.indexOf('\\') < 0 && e.indexOf('&') < 0 ? e : e.replace(A, function (e, r, t) {
                        return r ? r : u(e, t);
                    });
                }
                function f(e) {
                    return S[e];
                }
                function d(e) {
                    return D.test(e) ? e.replace(E, f) : e;
                }
                function m(e) {
                    return e.replace(F, '\\$&');
                }
                function g(e) {
                    switch (e) {
                    case 9:
                    case 32:
                        return !0;
                    }
                    return !1;
                }
                function _(e) {
                    if (e >= 8192 && 8202 >= e)
                        return !0;
                    switch (e) {
                    case 9:
                    case 10:
                    case 11:
                    case 12:
                    case 13:
                    case 32:
                    case 160:
                    case 5760:
                    case 8239:
                    case 8287:
                    case 12288:
                        return !0;
                    }
                    return !1;
                }
                function k(e) {
                    return z.test(e);
                }
                function b(e) {
                    switch (e) {
                    case 33:
                    case 34:
                    case 35:
                    case 36:
                    case 37:
                    case 38:
                    case 39:
                    case 40:
                    case 41:
                    case 42:
                    case 43:
                    case 44:
                    case 45:
                    case 46:
                    case 47:
                    case 58:
                    case 59:
                    case 60:
                    case 61:
                    case 62:
                    case 63:
                    case 64:
                    case 91:
                    case 92:
                    case 93:
                    case 94:
                    case 95:
                    case 96:
                    case 123:
                    case 124:
                    case 125:
                    case 126:
                        return !0;
                    default:
                        return !1;
                    }
                }
                function v(e) {
                    return e.trim().replace(/\s+/g, ' ').toUpperCase();
                }
                var x = Object.prototype.hasOwnProperty, y = /\\([!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~])/g, C = /&([a-z#][a-z0-9]{1,31});/gi, A = new RegExp(y.source + '|' + C.source, 'gi'), w = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))/i, q = e('./entities'), D = /[&<>"]/, E = /[&<>"]/g, S = {
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;'
                    }, F = /[.?*+^$[\]\\(){}|-]/g, z = e('uc.micro/categories/P/regex');
                t.lib = {}, t.lib.mdurl = e('mdurl'), t.lib.ucmicro = e('uc.micro'), t.assign = i, t.isString = s, t.has = o, t.unescapeMd = p, t.unescapeAll = h, t.isValidEntityCode = c, t.fromCodePoint = l, t.escapeHtml = d, t.arrayReplaceAt = a, t.isSpace = g, t.isWhiteSpace = _, t.isMdAsciiPunct = b, t.isPunctChar = k, t.escapeRE = m, t.normalizeReference = v;
            },
            {
                './entities': 1,
                mdurl: 60,
                'uc.micro': 66,
                'uc.micro/categories/P/regex': 64
            }
        ],
        6: [
            function (e, r, t) {
                'use strict';
                t.parseLinkLabel = e('./parse_link_label'), t.parseLinkDestination = e('./parse_link_destination'), t.parseLinkTitle = e('./parse_link_title');
            },
            {
                './parse_link_destination': 7,
                './parse_link_label': 8,
                './parse_link_title': 9
            }
        ],
        7: [
            function (e, r, t) {
                'use strict';
                var n = e('../common/utils').unescapeAll;
                r.exports = function (e, r, t) {
                    var s, o, i = 0, a = r, c = {
                            ok: !1,
                            pos: 0,
                            lines: 0,
                            str: ''
                        };
                    if (60 === e.charCodeAt(r)) {
                        for (r++; t > r;) {
                            if (s = e.charCodeAt(r), 10 === s)
                                return c;
                            if (62 === s)
                                return c.pos = r + 1, c.str = n(e.slice(a + 1, r)), c.ok = !0, c;
                            92 === s && t > r + 1 ? r += 2 : r++;
                        }
                        return c;
                    }
                    for (o = 0; t > r && (s = e.charCodeAt(r), 32 !== s) && !(32 > s || 127 === s);)
                        if (92 === s && t > r + 1)
                            r += 2;
                        else {
                            if (40 === s && (o++, o > 1))
                                break;
                            if (41 === s && (o--, 0 > o))
                                break;
                            r++;
                        }
                    return a === r ? c : (c.str = n(e.slice(a, r)), c.lines = i, c.pos = r, c.ok = !0, c);
                };
            },
            { '../common/utils': 5 }
        ],
        8: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e, r, t) {
                    var n, s, o, i, a = -1, c = e.posMax, l = e.pos;
                    for (e.pos = r + 1, n = 1; e.pos < c;) {
                        if (o = e.src.charCodeAt(e.pos), 93 === o && (n--, 0 === n)) {
                            s = !0;
                            break;
                        }
                        if (i = e.pos, e.md.inline.skipToken(e), 91 === o)
                            if (i === e.pos - 1)
                                n++;
                            else if (t)
                                return e.pos = l, -1;
                    }
                    return s && (a = e.pos), e.pos = l, a;
                };
            },
            {}
        ],
        9: [
            function (e, r, t) {
                'use strict';
                var n = e('../common/utils').unescapeAll;
                r.exports = function (e, r, t) {
                    var s, o, i = 0, a = r, c = {
                            ok: !1,
                            pos: 0,
                            lines: 0,
                            str: ''
                        };
                    if (r >= t)
                        return c;
                    if (o = e.charCodeAt(r), 34 !== o && 39 !== o && 40 !== o)
                        return c;
                    for (r++, 40 === o && (o = 41); t > r;) {
                        if (s = e.charCodeAt(r), s === o)
                            return c.pos = r + 1, c.lines = i, c.str = n(e.slice(a + 1, r)), c.ok = !0, c;
                        10 === s ? i++ : 92 === s && t > r + 1 && (r++, 10 === e.charCodeAt(r) && i++), r++;
                    }
                    return c;
                };
            },
            { '../common/utils': 5 }
        ],
        10: [
            function (e, r, t) {
                'use strict';
                function n(e) {
                    var r = e.trim().toLowerCase();
                    return _.test(r) ? k.test(r) ? !0 : !1 : !0;
                }
                function s(e) {
                    var r = d.parse(e, !0);
                    if (r.hostname && (!r.protocol || b.indexOf(r.protocol) >= 0))
                        try {
                            r.hostname = m.toASCII(r.hostname);
                        } catch (t) {
                        }
                    return d.encode(d.format(r));
                }
                function o(e) {
                    var r = d.parse(e, !0);
                    if (r.hostname && (!r.protocol || b.indexOf(r.protocol) >= 0))
                        try {
                            r.hostname = m.toUnicode(r.hostname);
                        } catch (t) {
                        }
                    return d.decode(d.format(r));
                }
                function i(e, r) {
                    return this instanceof i ? (r || a.isString(e) || (r = e || {}, e = 'default'), this.inline = new h(), this.block = new p(), this.core = new u(), this.renderer = new l(), this.linkify = new f(), this.validateLink = n, this.normalizeLink = s, this.normalizeLinkText = o, this.utils = a, this.helpers = c, this.options = {}, this.configure(e), void (r && this.set(r))) : new i(e, r);
                }
                var a = e('./common/utils'), c = e('./helpers'), l = e('./renderer'), u = e('./parser_core'), p = e('./parser_block'), h = e('./parser_inline'), f = e('linkify-it'), d = e('mdurl'), m = e('punycode'), g = {
                        'default': e('./presets/default'),
                        zero: e('./presets/zero'),
                        commonmark: e('./presets/commonmark')
                    }, _ = /^(vbscript|javascript|file|data):/, k = /^data:image\/(gif|png|jpeg|webp);/, b = [
                        'http:',
                        'https:',
                        'mailto:'
                    ];
                i.prototype.set = function (e) {
                    return a.assign(this.options, e), this;
                }, i.prototype.configure = function (e) {
                    var r, t = this;
                    if (a.isString(e) && (r = e, e = g[r], !e))
                        throw new Error('Wrong `markdown-it` preset "' + r + '", check name');
                    if (!e)
                        throw new Error('Wrong `markdown-it` preset, can\'t be empty');
                    return e.options && t.set(e.options), e.components && Object.keys(e.components).forEach(function (r) {
                        e.components[r].rules && t[r].ruler.enableOnly(e.components[r].rules), e.components[r].rules2 && t[r].ruler2.enableOnly(e.components[r].rules2);
                    }), this;
                }, i.prototype.enable = function (e, r) {
                    var t = [];
                    Array.isArray(e) || (e = [e]), [
                        'core',
                        'block',
                        'inline'
                    ].forEach(function (r) {
                        t = t.concat(this[r].ruler.enable(e, !0));
                    }, this), t = t.concat(this.inline.ruler2.enable(e, !0));
                    var n = e.filter(function (e) {
                        return t.indexOf(e) < 0;
                    });
                    if (n.length && !r)
                        throw new Error('MarkdownIt. Failed to enable unknown rule(s): ' + n);
                    return this;
                }, i.prototype.disable = function (e, r) {
                    var t = [];
                    Array.isArray(e) || (e = [e]), [
                        'core',
                        'block',
                        'inline'
                    ].forEach(function (r) {
                        t = t.concat(this[r].ruler.disable(e, !0));
                    }, this), t = t.concat(this.inline.ruler2.disable(e, !0));
                    var n = e.filter(function (e) {
                        return t.indexOf(e) < 0;
                    });
                    if (n.length && !r)
                        throw new Error('MarkdownIt. Failed to disable unknown rule(s): ' + n);
                    return this;
                }, i.prototype.use = function (e) {
                    var r = [this].concat(Array.prototype.slice.call(arguments, 1));
                    return e.apply(e, r), this;
                }, i.prototype.parse = function (e, r) {
                    var t = new this.core.State(e, this, r);
                    return this.core.process(t), t.tokens;
                }, i.prototype.render = function (e, r) {
                    return r = r || {}, this.renderer.render(this.parse(e, r), this.options, r);
                }, i.prototype.parseInline = function (e, r) {
                    var t = new this.core.State(e, this, r);
                    return t.inlineMode = !0, this.core.process(t), t.tokens;
                }, i.prototype.renderInline = function (e, r) {
                    return r = r || {}, this.renderer.render(this.parseInline(e, r), this.options, r);
                }, r.exports = i;
            },
            {
                './common/utils': 5,
                './helpers': 6,
                './parser_block': 11,
                './parser_core': 12,
                './parser_inline': 13,
                './presets/commonmark': 14,
                './presets/default': 15,
                './presets/zero': 16,
                './renderer': 17,
                'linkify-it': 55,
                mdurl: 60,
                punycode: 53
            }
        ],
        11: [
            function (e, r, t) {
                'use strict';
                function n() {
                    this.ruler = new s();
                    for (var e = 0; e < o.length; e++)
                        this.ruler.push(o[e][0], o[e][1], { alt: (o[e][2] || []).slice() });
                }
                var s = e('./ruler'), o = [
                        [
                            'table',
                            e('./rules_block/table'),
                            [
                                'paragraph',
                                'reference'
                            ]
                        ],
                        [
                            'code',
                            e('./rules_block/code')
                        ],
                        [
                            'fence',
                            e('./rules_block/fence'),
                            [
                                'paragraph',
                                'reference',
                                'blockquote',
                                'list'
                            ]
                        ],
                        [
                            'blockquote',
                            e('./rules_block/blockquote'),
                            [
                                'paragraph',
                                'reference',
                                'list'
                            ]
                        ],
                        [
                            'hr',
                            e('./rules_block/hr'),
                            [
                                'paragraph',
                                'reference',
                                'blockquote',
                                'list'
                            ]
                        ],
                        [
                            'list',
                            e('./rules_block/list'),
                            [
                                'paragraph',
                                'reference',
                                'blockquote'
                            ]
                        ],
                        [
                            'reference',
                            e('./rules_block/reference')
                        ],
                        [
                            'heading',
                            e('./rules_block/heading'),
                            [
                                'paragraph',
                                'reference',
                                'blockquote'
                            ]
                        ],
                        [
                            'lheading',
                            e('./rules_block/lheading')
                        ],
                        [
                            'html_block',
                            e('./rules_block/html_block'),
                            [
                                'paragraph',
                                'reference',
                                'blockquote'
                            ]
                        ],
                        [
                            'paragraph',
                            e('./rules_block/paragraph')
                        ]
                    ];
                n.prototype.tokenize = function (e, r, t) {
                    for (var n, s, o = this.ruler.getRules(''), i = o.length, a = r, c = !1, l = e.md.options.maxNesting; t > a && (e.line = a = e.skipEmptyLines(a), !(a >= t)) && !(e.sCount[a] < e.blkIndent);) {
                        if (e.level >= l) {
                            e.line = t;
                            break;
                        }
                        for (s = 0; i > s && !(n = o[s](e, a, t, !1)); s++);
                        if (e.tight = !c, e.isEmpty(e.line - 1) && (c = !0), a = e.line, t > a && e.isEmpty(a)) {
                            if (c = !0, a++, t > a && 'list' === e.parentType && e.isEmpty(a))
                                break;
                            e.line = a;
                        }
                    }
                }, n.prototype.parse = function (e, r, t, n) {
                    var s;
                    return e ? (s = new this.State(e, r, t, n), void this.tokenize(s, s.line, s.lineMax)) : [];
                }, n.prototype.State = e('./rules_block/state_block'), r.exports = n;
            },
            {
                './ruler': 18,
                './rules_block/blockquote': 19,
                './rules_block/code': 20,
                './rules_block/fence': 21,
                './rules_block/heading': 22,
                './rules_block/hr': 23,
                './rules_block/html_block': 24,
                './rules_block/lheading': 25,
                './rules_block/list': 26,
                './rules_block/paragraph': 27,
                './rules_block/reference': 28,
                './rules_block/state_block': 29,
                './rules_block/table': 30
            }
        ],
        12: [
            function (e, r, t) {
                'use strict';
                function n() {
                    this.ruler = new s();
                    for (var e = 0; e < o.length; e++)
                        this.ruler.push(o[e][0], o[e][1]);
                }
                var s = e('./ruler'), o = [
                        [
                            'normalize',
                            e('./rules_core/normalize')
                        ],
                        [
                            'block',
                            e('./rules_core/block')
                        ],
                        [
                            'inline',
                            e('./rules_core/inline')
                        ],
                        [
                            'linkify',
                            e('./rules_core/linkify')
                        ],
                        [
                            'replacements',
                            e('./rules_core/replacements')
                        ],
                        [
                            'smartquotes',
                            e('./rules_core/smartquotes')
                        ]
                    ];
                n.prototype.process = function (e) {
                    var r, t, n;
                    for (n = this.ruler.getRules(''), r = 0, t = n.length; t > r; r++)
                        n[r](e);
                }, n.prototype.State = e('./rules_core/state_core'), r.exports = n;
            },
            {
                './ruler': 18,
                './rules_core/block': 31,
                './rules_core/inline': 32,
                './rules_core/linkify': 33,
                './rules_core/normalize': 34,
                './rules_core/replacements': 35,
                './rules_core/smartquotes': 36,
                './rules_core/state_core': 37
            }
        ],
        13: [
            function (e, r, t) {
                'use strict';
                function n() {
                    var e;
                    for (this.ruler = new s(), e = 0; e < o.length; e++)
                        this.ruler.push(o[e][0], o[e][1]);
                    for (this.ruler2 = new s(), e = 0; e < i.length; e++)
                        this.ruler2.push(i[e][0], i[e][1]);
                }
                var s = e('./ruler'), o = [
                        [
                            'text',
                            e('./rules_inline/text')
                        ],
                        [
                            'newline',
                            e('./rules_inline/newline')
                        ],
                        [
                            'escape',
                            e('./rules_inline/escape')
                        ],
                        [
                            'backticks',
                            e('./rules_inline/backticks')
                        ],
                        [
                            'strikethrough',
                            e('./rules_inline/strikethrough').tokenize
                        ],
                        [
                            'emphasis',
                            e('./rules_inline/emphasis').tokenize
                        ],
                        [
                            'link',
                            e('./rules_inline/link')
                        ],
                        [
                            'image',
                            e('./rules_inline/image')
                        ],
                        [
                            'autolink',
                            e('./rules_inline/autolink')
                        ],
                        [
                            'html_inline',
                            e('./rules_inline/html_inline')
                        ],
                        [
                            'entity',
                            e('./rules_inline/entity')
                        ]
                    ], i = [
                        [
                            'balance_pairs',
                            e('./rules_inline/balance_pairs')
                        ],
                        [
                            'strikethrough',
                            e('./rules_inline/strikethrough').postProcess
                        ],
                        [
                            'emphasis',
                            e('./rules_inline/emphasis').postProcess
                        ],
                        [
                            'text_collapse',
                            e('./rules_inline/text_collapse')
                        ]
                    ];
                n.prototype.skipToken = function (e) {
                    var r, t = e.pos, n = this.ruler.getRules(''), s = n.length, o = e.md.options.maxNesting, i = e.cache;
                    if ('undefined' != typeof i[t])
                        return void (e.pos = i[t]);
                    if (e.level < o)
                        for (r = 0; s > r; r++)
                            if (n[r](e, !0))
                                return void (i[t] = e.pos);
                    e.pos++, i[t] = e.pos;
                }, n.prototype.tokenize = function (e) {
                    for (var r, t, n = this.ruler.getRules(''), s = n.length, o = e.posMax, i = e.md.options.maxNesting; e.pos < o;) {
                        if (e.level < i)
                            for (t = 0; s > t && !(r = n[t](e, !1)); t++);
                        if (r) {
                            if (e.pos >= o)
                                break;
                        } else
                            e.pending += e.src[e.pos++];
                    }
                    e.pending && e.pushPending();
                }, n.prototype.parse = function (e, r, t, n) {
                    var s, o, i, a = new this.State(e, r, t, n);
                    for (this.tokenize(a), o = this.ruler2.getRules(''), i = o.length, s = 0; i > s; s++)
                        o[s](a);
                }, n.prototype.State = e('./rules_inline/state_inline'), r.exports = n;
            },
            {
                './ruler': 18,
                './rules_inline/autolink': 38,
                './rules_inline/backticks': 39,
                './rules_inline/balance_pairs': 40,
                './rules_inline/emphasis': 41,
                './rules_inline/entity': 42,
                './rules_inline/escape': 43,
                './rules_inline/html_inline': 44,
                './rules_inline/image': 45,
                './rules_inline/link': 46,
                './rules_inline/newline': 47,
                './rules_inline/state_inline': 48,
                './rules_inline/strikethrough': 49,
                './rules_inline/text': 50,
                './rules_inline/text_collapse': 51
            }
        ],
        14: [
            function (e, r, t) {
                'use strict';
                r.exports = {
                    options: {
                        html: !0,
                        xhtmlOut: !0,
                        breaks: !1,
                        langPrefix: 'language-',
                        linkify: !1,
                        typographer: !1,
                        quotes: '\u201C\u201D\u2018\u2019',
                        highlight: null,
                        maxNesting: 20
                    },
                    components: {
                        core: {
                            rules: [
                                'normalize',
                                'block',
                                'inline'
                            ]
                        },
                        block: {
                            rules: [
                                'blockquote',
                                'code',
                                'fence',
                                'heading',
                                'hr',
                                'html_block',
                                'lheading',
                                'list',
                                'reference',
                                'paragraph'
                            ]
                        },
                        inline: {
                            rules: [
                                'autolink',
                                'backticks',
                                'emphasis',
                                'entity',
                                'escape',
                                'html_inline',
                                'image',
                                'link',
                                'newline',
                                'text'
                            ],
                            rules2: [
                                'balance_pairs',
                                'emphasis',
                                'text_collapse'
                            ]
                        }
                    }
                };
            },
            {}
        ],
        15: [
            function (e, r, t) {
                'use strict';
                r.exports = {
                    options: {
                        html: !1,
                        xhtmlOut: !1,
                        breaks: !1,
                        langPrefix: 'language-',
                        linkify: !1,
                        typographer: !1,
                        quotes: '\u201C\u201D\u2018\u2019',
                        highlight: null,
                        maxNesting: 20
                    },
                    components: {
                        core: {},
                        block: {},
                        inline: {}
                    }
                };
            },
            {}
        ],
        16: [
            function (e, r, t) {
                'use strict';
                r.exports = {
                    options: {
                        html: !1,
                        xhtmlOut: !1,
                        breaks: !1,
                        langPrefix: 'language-',
                        linkify: !1,
                        typographer: !1,
                        quotes: '\u201C\u201D\u2018\u2019',
                        highlight: null,
                        maxNesting: 20
                    },
                    components: {
                        core: {
                            rules: [
                                'normalize',
                                'block',
                                'inline'
                            ]
                        },
                        block: { rules: ['paragraph'] },
                        inline: {
                            rules: ['text'],
                            rules2: [
                                'balance_pairs',
                                'text_collapse'
                            ]
                        }
                    }
                };
            },
            {}
        ],
        17: [
            function (e, r, t) {
                'use strict';
                function n() {
                    this.rules = s({}, a);
                }
                var s = e('./common/utils').assign, o = e('./common/utils').unescapeAll, i = e('./common/utils').escapeHtml, a = {};
                a.code_inline = function (e, r) {
                    return '<code>' + i(e[r].content) + '</code>';
                }, a.code_block = function (e, r) {
                    return '<pre><code>' + i(e[r].content) + '</code></pre>\n';
                }, a.fence = function (e, r, t, n, s) {
                    var a, c = e[r], l = c.info ? o(c.info).trim() : '', u = '';
                    return l && (u = l.split(/\s+/g)[0], c.attrPush([
                        'class',
                        t.langPrefix + u
                    ])), a = t.highlight ? t.highlight(c.content, u) || i(c.content) : i(c.content), '<pre><code' + s.renderAttrs(c) + '>' + a + '</code></pre>\n';
                }, a.image = function (e, r, t, n, s) {
                    var o = e[r];
                    return o.attrs[o.attrIndex('alt')][1] = s.renderInlineAsText(o.children, t, n), s.renderToken(e, r, t);
                }, a.hardbreak = function (e, r, t) {
                    return t.xhtmlOut ? '<br />\n' : '<br>\n';
                }, a.softbreak = function (e, r, t) {
                    return t.breaks ? t.xhtmlOut ? '<br />\n' : '<br>\n' : '\n';
                }, a.text = function (e, r) {
                    return i(e[r].content);
                }, a.html_block = function (e, r) {
                    return e[r].content;
                }, a.html_inline = function (e, r) {
                    return e[r].content;
                }, n.prototype.renderAttrs = function (e) {
                    var r, t, n;
                    if (!e.attrs)
                        return '';
                    for (n = '', r = 0, t = e.attrs.length; t > r; r++)
                        n += ' ' + i(e.attrs[r][0]) + '="' + i(e.attrs[r][1]) + '"';
                    return n;
                }, n.prototype.renderToken = function (e, r, t) {
                    var n, s = '', o = !1, i = e[r];
                    return i.hidden ? '' : (i.block && -1 !== i.nesting && r && e[r - 1].hidden && (s += '\n'), s += (-1 === i.nesting ? '</' : '<') + i.tag, s += this.renderAttrs(i), 0 === i.nesting && t.xhtmlOut && (s += ' /'), i.block && (o = !0, 1 === i.nesting && r + 1 < e.length && (n = e[r + 1], 'inline' === n.type || n.hidden ? o = !1 : -1 === n.nesting && n.tag === i.tag && (o = !1))), s += o ? '>\n' : '>');
                }, n.prototype.renderInline = function (e, r, t) {
                    for (var n, s = '', o = this.rules, i = 0, a = e.length; a > i; i++)
                        n = e[i].type, s += 'undefined' != typeof o[n] ? o[n](e, i, r, t, this) : this.renderToken(e, i, r);
                    return s;
                }, n.prototype.renderInlineAsText = function (e, r, t) {
                    for (var n = '', s = this.rules, o = 0, i = e.length; i > o; o++)
                        'text' === e[o].type ? n += s.text(e, o, r, t, this) : 'image' === e[o].type && (n += this.renderInlineAsText(e[o].children, r, t));
                    return n;
                }, n.prototype.render = function (e, r, t) {
                    var n, s, o, i = '', a = this.rules;
                    for (n = 0, s = e.length; s > n; n++)
                        o = e[n].type, i += 'inline' === o ? this.renderInline(e[n].children, r, t) : 'undefined' != typeof a[o] ? a[e[n].type](e, n, r, t, this) : this.renderToken(e, n, r, t);
                    return i;
                }, r.exports = n;
            },
            { './common/utils': 5 }
        ],
        18: [
            function (e, r, t) {
                'use strict';
                function n() {
                    this.__rules__ = [], this.__cache__ = null;
                }
                n.prototype.__find__ = function (e) {
                    for (var r = 0; r < this.__rules__.length; r++)
                        if (this.__rules__[r].name === e)
                            return r;
                    return -1;
                }, n.prototype.__compile__ = function () {
                    var e = this, r = [''];
                    e.__rules__.forEach(function (e) {
                        e.enabled && e.alt.forEach(function (e) {
                            r.indexOf(e) < 0 && r.push(e);
                        });
                    }), e.__cache__ = {}, r.forEach(function (r) {
                        e.__cache__[r] = [], e.__rules__.forEach(function (t) {
                            t.enabled && (r && t.alt.indexOf(r) < 0 || e.__cache__[r].push(t.fn));
                        });
                    });
                }, n.prototype.at = function (e, r, t) {
                    var n = this.__find__(e), s = t || {};
                    if (-1 === n)
                        throw new Error('Parser rule not found: ' + e);
                    this.__rules__[n].fn = r, this.__rules__[n].alt = s.alt || [], this.__cache__ = null;
                }, n.prototype.before = function (e, r, t, n) {
                    var s = this.__find__(e), o = n || {};
                    if (-1 === s)
                        throw new Error('Parser rule not found: ' + e);
                    this.__rules__.splice(s, 0, {
                        name: r,
                        enabled: !0,
                        fn: t,
                        alt: o.alt || []
                    }), this.__cache__ = null;
                }, n.prototype.after = function (e, r, t, n) {
                    var s = this.__find__(e), o = n || {};
                    if (-1 === s)
                        throw new Error('Parser rule not found: ' + e);
                    this.__rules__.splice(s + 1, 0, {
                        name: r,
                        enabled: !0,
                        fn: t,
                        alt: o.alt || []
                    }), this.__cache__ = null;
                }, n.prototype.push = function (e, r, t) {
                    var n = t || {};
                    this.__rules__.push({
                        name: e,
                        enabled: !0,
                        fn: r,
                        alt: n.alt || []
                    }), this.__cache__ = null;
                }, n.prototype.enable = function (e, r) {
                    Array.isArray(e) || (e = [e]);
                    var t = [];
                    return e.forEach(function (e) {
                        var n = this.__find__(e);
                        if (0 > n) {
                            if (r)
                                return;
                            throw new Error('Rules manager: invalid rule name ' + e);
                        }
                        this.__rules__[n].enabled = !0, t.push(e);
                    }, this), this.__cache__ = null, t;
                }, n.prototype.enableOnly = function (e, r) {
                    Array.isArray(e) || (e = [e]), this.__rules__.forEach(function (e) {
                        e.enabled = !1;
                    }), this.enable(e, r);
                }, n.prototype.disable = function (e, r) {
                    Array.isArray(e) || (e = [e]);
                    var t = [];
                    return e.forEach(function (e) {
                        var n = this.__find__(e);
                        if (0 > n) {
                            if (r)
                                return;
                            throw new Error('Rules manager: invalid rule name ' + e);
                        }
                        this.__rules__[n].enabled = !1, t.push(e);
                    }, this), this.__cache__ = null, t;
                }, n.prototype.getRules = function (e) {
                    return null === this.__cache__ && this.__compile__(), this.__cache__[e] || [];
                }, r.exports = n;
            },
            {}
        ],
        19: [
            function (e, r, t) {
                'use strict';
                var n = e('../common/utils').isSpace;
                r.exports = function (e, r, t, s) {
                    var o, i, a, c, l, u, p, h, f, d, m, g, _, k, b, v, x = e.bMarks[r] + e.tShift[r], y = e.eMarks[r];
                    if (62 !== e.src.charCodeAt(x++))
                        return !1;
                    if (s)
                        return !0;
                    for (32 === e.src.charCodeAt(x) && x++, u = e.blkIndent, e.blkIndent = 0, f = d = e.sCount[r] + x - (e.bMarks[r] + e.tShift[r]), l = [e.bMarks[r]], e.bMarks[r] = x; y > x && (m = e.src.charCodeAt(x), n(m));)
                        9 === m ? d += 4 - d % 4 : d++, x++;
                    for (i = x >= y, c = [e.sCount[r]], e.sCount[r] = d - f, a = [e.tShift[r]], e.tShift[r] = x - e.bMarks[r], g = e.md.block.ruler.getRules('blockquote'), o = r + 1; t > o && !(e.sCount[o] < u) && (x = e.bMarks[o] + e.tShift[o], y = e.eMarks[o], !(x >= y)); o++)
                        if (62 !== e.src.charCodeAt(x++)) {
                            if (i)
                                break;
                            for (v = !1, k = 0, b = g.length; b > k; k++)
                                if (g[k](e, o, t, !0)) {
                                    v = !0;
                                    break;
                                }
                            if (v)
                                break;
                            l.push(e.bMarks[o]), a.push(e.tShift[o]), c.push(e.sCount[o]), e.sCount[o] = -1;
                        } else {
                            for (32 === e.src.charCodeAt(x) && x++, f = d = e.sCount[o] + x - (e.bMarks[o] + e.tShift[o]), l.push(e.bMarks[o]), e.bMarks[o] = x; y > x && (m = e.src.charCodeAt(x), n(m));)
                                9 === m ? d += 4 - d % 4 : d++, x++;
                            i = x >= y, c.push(e.sCount[o]), e.sCount[o] = d - f, a.push(e.tShift[o]), e.tShift[o] = x - e.bMarks[o];
                        }
                    for (p = e.parentType, e.parentType = 'blockquote', _ = e.push('blockquote_open', 'blockquote', 1), _.markup = '>', _.map = h = [
                            r,
                            0
                        ], e.md.block.tokenize(e, r, o), _ = e.push('blockquote_close', 'blockquote', -1), _.markup = '>', e.parentType = p, h[1] = e.line, k = 0; k < a.length; k++)
                        e.bMarks[k + r] = l[k], e.tShift[k + r] = a[k], e.sCount[k + r] = c[k];
                    return e.blkIndent = u, !0;
                };
            },
            { '../common/utils': 5 }
        ],
        20: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e, r, t) {
                    var n, s, o;
                    if (e.sCount[r] - e.blkIndent < 4)
                        return !1;
                    for (s = n = r + 1; t > n;)
                        if (e.isEmpty(n))
                            n++;
                        else {
                            if (!(e.sCount[n] - e.blkIndent >= 4))
                                break;
                            n++, s = n;
                        }
                    return e.line = n, o = e.push('code_block', 'code', 0), o.content = e.getLines(r, s, 4 + e.blkIndent, !0), o.map = [
                        r,
                        e.line
                    ], !0;
                };
            },
            {}
        ],
        21: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e, r, t, n) {
                    var s, o, i, a, c, l, u, p = !1, h = e.bMarks[r] + e.tShift[r], f = e.eMarks[r];
                    if (h + 3 > f)
                        return !1;
                    if (s = e.src.charCodeAt(h), 126 !== s && 96 !== s)
                        return !1;
                    if (c = h, h = e.skipChars(h, s), o = h - c, 3 > o)
                        return !1;
                    if (u = e.src.slice(c, h), i = e.src.slice(h, f), i.indexOf('`') >= 0)
                        return !1;
                    if (n)
                        return !0;
                    for (a = r; (a++, !(a >= t)) && (h = c = e.bMarks[a] + e.tShift[a], f = e.eMarks[a], !(f > h && e.sCount[a] < e.blkIndent));)
                        if (e.src.charCodeAt(h) === s && !(e.sCount[a] - e.blkIndent >= 4 || (h = e.skipChars(h, s), o > h - c || (h = e.skipSpaces(h), f > h)))) {
                            p = !0;
                            break;
                        }
                    return o = e.sCount[r], e.line = a + (p ? 1 : 0), l = e.push('fence', 'code', 0), l.info = i, l.content = e.getLines(r + 1, a, o, !0), l.markup = u, l.map = [
                        r,
                        e.line
                    ], !0;
                };
            },
            {}
        ],
        22: [
            function (e, r, t) {
                'use strict';
                var n = e('../common/utils').isSpace;
                r.exports = function (e, r, t, s) {
                    var o, i, a, c, l = e.bMarks[r] + e.tShift[r], u = e.eMarks[r];
                    if (o = e.src.charCodeAt(l), 35 !== o || l >= u)
                        return !1;
                    for (i = 1, o = e.src.charCodeAt(++l); 35 === o && u > l && 6 >= i;)
                        i++, o = e.src.charCodeAt(++l);
                    return i > 6 || u > l && 32 !== o ? !1 : s ? !0 : (u = e.skipSpacesBack(u, l), a = e.skipCharsBack(u, 35, l), a > l && n(e.src.charCodeAt(a - 1)) && (u = a), e.line = r + 1, c = e.push('heading_open', 'h' + String(i), 1), c.markup = '########'.slice(0, i), c.map = [
                        r,
                        e.line
                    ], c = e.push('inline', '', 0), c.content = e.src.slice(l, u).trim(), c.map = [
                        r,
                        e.line
                    ], c.children = [], c = e.push('heading_close', 'h' + String(i), -1), c.markup = '########'.slice(0, i), !0);
                };
            },
            { '../common/utils': 5 }
        ],
        23: [
            function (e, r, t) {
                'use strict';
                var n = e('../common/utils').isSpace;
                r.exports = function (e, r, t, s) {
                    var o, i, a, c, l = e.bMarks[r] + e.tShift[r], u = e.eMarks[r];
                    if (o = e.src.charCodeAt(l++), 42 !== o && 45 !== o && 95 !== o)
                        return !1;
                    for (i = 1; u > l;) {
                        if (a = e.src.charCodeAt(l++), a !== o && !n(a))
                            return !1;
                        a === o && i++;
                    }
                    return 3 > i ? !1 : s ? !0 : (e.line = r + 1, c = e.push('hr', 'hr', 0), c.map = [
                        r,
                        e.line
                    ], c.markup = Array(i + 1).join(String.fromCharCode(o)), !0);
                };
            },
            { '../common/utils': 5 }
        ],
        24: [
            function (e, r, t) {
                'use strict';
                var n = e('../common/html_blocks'), s = e('../common/html_re').HTML_OPEN_CLOSE_TAG_RE, o = [
                        [
                            /^<(script|pre|style)(?=(\s|>|$))/i,
                            /<\/(script|pre|style)>/i,
                            !0
                        ],
                        [
                            /^<!--/,
                            /-->/,
                            !0
                        ],
                        [
                            /^<\?/,
                            /\?>/,
                            !0
                        ],
                        [
                            /^<![A-Z]/,
                            />/,
                            !0
                        ],
                        [
                            /^<!\[CDATA\[/,
                            /\]\]>/,
                            !0
                        ],
                        [
                            new RegExp('^</?(' + n.join('|') + ')(?=(\\s|/?>|$))', 'i'),
                            /^$/,
                            !0
                        ],
                        [
                            new RegExp(s.source + '\\s*$'),
                            /^$/,
                            !1
                        ]
                    ];
                r.exports = function (e, r, t, n) {
                    var s, i, a, c, l = e.bMarks[r] + e.tShift[r], u = e.eMarks[r];
                    if (!e.md.options.html)
                        return !1;
                    if (60 !== e.src.charCodeAt(l))
                        return !1;
                    for (c = e.src.slice(l, u), s = 0; s < o.length && !o[s][0].test(c); s++);
                    if (s === o.length)
                        return !1;
                    if (n)
                        return o[s][2];
                    if (i = r + 1, !o[s][1].test(c))
                        for (; t > i && !(e.sCount[i] < e.blkIndent); i++)
                            if (l = e.bMarks[i] + e.tShift[i], u = e.eMarks[i], c = e.src.slice(l, u), o[s][1].test(c)) {
                                0 !== c.length && i++;
                                break;
                            }
                    return e.line = i, a = e.push('html_block', '', 0), a.map = [
                        r,
                        i
                    ], a.content = e.getLines(r, i, e.blkIndent, !0), !0;
                };
            },
            {
                '../common/html_blocks': 2,
                '../common/html_re': 3
            }
        ],
        25: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e, r, t) {
                    var n, s, o, i, a, c = r + 1;
                    return c >= t ? !1 : e.sCount[c] < e.blkIndent ? !1 : e.sCount[c] - e.blkIndent > 3 ? !1 : (s = e.bMarks[c] + e.tShift[c], o = e.eMarks[c], s >= o ? !1 : (n = e.src.charCodeAt(s), 45 !== n && 61 !== n ? !1 : (s = e.skipChars(s, n), s = e.skipSpaces(s), o > s ? !1 : (s = e.bMarks[r] + e.tShift[r], e.line = c + 1, a = 61 === n ? 1 : 2, i = e.push('heading_open', 'h' + String(a), 1), i.markup = String.fromCharCode(n), i.map = [
                        r,
                        e.line
                    ], i = e.push('inline', '', 0), i.content = e.src.slice(s, e.eMarks[r]).trim(), i.map = [
                        r,
                        e.line - 1
                    ], i.children = [], i = e.push('heading_close', 'h' + String(a), -1), i.markup = String.fromCharCode(n), !0))));
                };
            },
            {}
        ],
        26: [
            function (e, r, t) {
                'use strict';
                function n(e, r) {
                    var t, n, s, o;
                    return n = e.bMarks[r] + e.tShift[r], s = e.eMarks[r], t = e.src.charCodeAt(n++), 42 !== t && 45 !== t && 43 !== t ? -1 : s > n && (o = e.src.charCodeAt(n), !i(o)) ? -1 : n;
                }
                function s(e, r) {
                    var t, n = e.bMarks[r] + e.tShift[r], s = n, o = e.eMarks[r];
                    if (s + 1 >= o)
                        return -1;
                    if (t = e.src.charCodeAt(s++), 48 > t || t > 57)
                        return -1;
                    for (;;) {
                        if (s >= o)
                            return -1;
                        t = e.src.charCodeAt(s++);
                        {
                            if (!(t >= 48 && 57 >= t)) {
                                if (41 === t || 46 === t)
                                    break;
                                return -1;
                            }
                            if (s - n >= 10)
                                return -1;
                        }
                    }
                    return o > s && (t = e.src.charCodeAt(s), !i(t)) ? -1 : s;
                }
                function o(e, r) {
                    var t, n, s = e.level + 2;
                    for (t = r + 2, n = e.tokens.length - 2; n > t; t++)
                        e.tokens[t].level === s && 'paragraph_open' === e.tokens[t].type && (e.tokens[t + 2].hidden = !0, e.tokens[t].hidden = !0, t += 2);
                }
                var i = e('../common/utils').isSpace;
                r.exports = function (e, r, t, a) {
                    var c, l, u, p, h, f, d, m, g, _, k, b, v, x, y, C, A, w, q, D, E, S, F, z, L, T, R, M, I = !0;
                    if ((k = s(e, r)) >= 0)
                        w = !0;
                    else {
                        if (!((k = n(e, r)) >= 0))
                            return !1;
                        w = !1;
                    }
                    if (A = e.src.charCodeAt(k - 1), a)
                        return !0;
                    for (D = e.tokens.length, w ? (_ = e.bMarks[r] + e.tShift[r], C = Number(e.src.substr(_, k - _ - 1)), L = e.push('ordered_list_open', 'ol', 1), 1 !== C && (L.attrs = [[
                                'start',
                                C
                            ]])) : L = e.push('bullet_list_open', 'ul', 1), L.map = S = [
                            r,
                            0
                        ], L.markup = String.fromCharCode(A), c = r, E = !1, z = e.md.block.ruler.getRules('list'); t > c;) {
                        for (v = k, x = e.eMarks[c], l = u = e.sCount[c] + k - (e.bMarks[r] + e.tShift[r]); x > v && (b = e.src.charCodeAt(v), i(b));)
                            9 === b ? u += 4 - u % 4 : u++, v++;
                        if (q = v, y = q >= x ? 1 : u - l, y > 4 && (y = 1), p = l + y, L = e.push('list_item_open', 'li', 1), L.markup = String.fromCharCode(A), L.map = F = [
                                r,
                                0
                            ], f = e.blkIndent, m = e.tight, h = e.tShift[r], d = e.sCount[r], g = e.parentType, e.blkIndent = p, e.tight = !0, e.parentType = 'list', e.tShift[r] = q - e.bMarks[r], e.sCount[r] = u, e.md.block.tokenize(e, r, t, !0), (!e.tight || E) && (I = !1), E = e.line - r > 1 && e.isEmpty(e.line - 1), e.blkIndent = f, e.tShift[r] = h, e.sCount[r] = d, e.tight = m, e.parentType = g, L = e.push('list_item_close', 'li', -1), L.markup = String.fromCharCode(A), c = r = e.line, F[1] = c, q = e.bMarks[r], c >= t)
                            break;
                        if (e.isEmpty(c))
                            break;
                        if (e.sCount[c] < e.blkIndent)
                            break;
                        for (M = !1, T = 0, R = z.length; R > T; T++)
                            if (z[T](e, c, t, !0)) {
                                M = !0;
                                break;
                            }
                        if (M)
                            break;
                        if (w) {
                            if (k = s(e, c), 0 > k)
                                break;
                        } else if (k = n(e, c), 0 > k)
                            break;
                        if (A !== e.src.charCodeAt(k - 1))
                            break;
                    }
                    return L = w ? e.push('ordered_list_close', 'ol', -1) : e.push('bullet_list_close', 'ul', -1), L.markup = String.fromCharCode(A), S[1] = c, e.line = c, I && o(e, D), !0;
                };
            },
            { '../common/utils': 5 }
        ],
        27: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e, r) {
                    for (var t, n, s, o, i, a = r + 1, c = e.md.block.ruler.getRules('paragraph'), l = e.lineMax; l > a && !e.isEmpty(a); a++)
                        if (!(e.sCount[a] - e.blkIndent > 3 || e.sCount[a] < 0)) {
                            for (n = !1, s = 0, o = c.length; o > s; s++)
                                if (c[s](e, a, l, !0)) {
                                    n = !0;
                                    break;
                                }
                            if (n)
                                break;
                        }
                    return t = e.getLines(r, a, e.blkIndent, !1).trim(), e.line = a, i = e.push('paragraph_open', 'p', 1), i.map = [
                        r,
                        e.line
                    ], i = e.push('inline', '', 0), i.content = t, i.map = [
                        r,
                        e.line
                    ], i.children = [], i = e.push('paragraph_close', 'p', -1), !0;
                };
            },
            {}
        ],
        28: [
            function (e, r, t) {
                'use strict';
                var n = e('../helpers/parse_link_destination'), s = e('../helpers/parse_link_title'), o = e('../common/utils').normalizeReference, i = e('../common/utils').isSpace;
                r.exports = function (e, r, t, a) {
                    var c, l, u, p, h, f, d, m, g, _, k, b, v, x, y, C = 0, A = e.bMarks[r] + e.tShift[r], w = e.eMarks[r], q = r + 1;
                    if (91 !== e.src.charCodeAt(A))
                        return !1;
                    for (; ++A < w;)
                        if (93 === e.src.charCodeAt(A) && 92 !== e.src.charCodeAt(A - 1)) {
                            if (A + 1 === w)
                                return !1;
                            if (58 !== e.src.charCodeAt(A + 1))
                                return !1;
                            break;
                        }
                    for (p = e.lineMax, x = e.md.block.ruler.getRules('reference'); p > q && !e.isEmpty(q); q++)
                        if (!(e.sCount[q] - e.blkIndent > 3 || e.sCount[q] < 0)) {
                            for (v = !1, f = 0, d = x.length; d > f; f++)
                                if (x[f](e, q, p, !0)) {
                                    v = !0;
                                    break;
                                }
                            if (v)
                                break;
                        }
                    for (b = e.getLines(r, q, e.blkIndent, !1).trim(), w = b.length, A = 1; w > A; A++) {
                        if (c = b.charCodeAt(A), 91 === c)
                            return !1;
                        if (93 === c) {
                            g = A;
                            break;
                        }
                        10 === c ? C++ : 92 === c && (A++, w > A && 10 === b.charCodeAt(A) && C++);
                    }
                    if (0 > g || 58 !== b.charCodeAt(g + 1))
                        return !1;
                    for (A = g + 2; w > A; A++)
                        if (c = b.charCodeAt(A), 10 === c)
                            C++;
                        else if (!i(c))
                            break;
                    if (_ = n(b, A, w), !_.ok)
                        return !1;
                    if (h = e.md.normalizeLink(_.str), !e.md.validateLink(h))
                        return !1;
                    for (A = _.pos, C += _.lines, l = A, u = C, k = A; w > A; A++)
                        if (c = b.charCodeAt(A), 10 === c)
                            C++;
                        else if (!i(c))
                            break;
                    for (_ = s(b, A, w), w > A && k !== A && _.ok ? (y = _.str, A = _.pos, C += _.lines) : (y = '', A = l, C = u); w > A && (c = b.charCodeAt(A), i(c));)
                        A++;
                    if (w > A && 10 !== b.charCodeAt(A) && y)
                        for (y = '', A = l, C = u; w > A && (c = b.charCodeAt(A), i(c));)
                            A++;
                    return w > A && 10 !== b.charCodeAt(A) ? !1 : (m = o(b.slice(1, g))) ? a ? !0 : ('undefined' == typeof e.env.references && (e.env.references = {}), 'undefined' == typeof e.env.references[m] && (e.env.references[m] = {
                        title: y,
                        href: h
                    }), e.line = r + C + 1, !0) : !1;
                };
            },
            {
                '../common/utils': 5,
                '../helpers/parse_link_destination': 7,
                '../helpers/parse_link_title': 9
            }
        ],
        29: [
            function (e, r, t) {
                'use strict';
                function n(e, r, t, n) {
                    var s, i, a, c, l, u, p, h;
                    for (this.src = e, this.md = r, this.env = t, this.tokens = n, this.bMarks = [], this.eMarks = [], this.tShift = [], this.sCount = [], this.blkIndent = 0, this.line = 0, this.lineMax = 0, this.tight = !1, this.parentType = 'root', this.ddIndent = -1, this.level = 0, this.result = '', i = this.src, h = !1, a = c = u = p = 0, l = i.length; l > c; c++) {
                        if (s = i.charCodeAt(c), !h) {
                            if (o(s)) {
                                u++, 9 === s ? p += 4 - p % 4 : p++;
                                continue;
                            }
                            h = !0;
                        }
                        (10 === s || c === l - 1) && (10 !== s && c++, this.bMarks.push(a), this.eMarks.push(c), this.tShift.push(u), this.sCount.push(p), h = !1, u = 0, p = 0, a = c + 1);
                    }
                    this.bMarks.push(i.length), this.eMarks.push(i.length), this.tShift.push(0), this.sCount.push(0), this.lineMax = this.bMarks.length - 1;
                }
                var s = e('../token'), o = e('../common/utils').isSpace;
                n.prototype.push = function (e, r, t) {
                    var n = new s(e, r, t);
                    return n.block = !0, 0 > t && this.level--, n.level = this.level, t > 0 && this.level++, this.tokens.push(n), n;
                }, n.prototype.isEmpty = function (e) {
                    return this.bMarks[e] + this.tShift[e] >= this.eMarks[e];
                }, n.prototype.skipEmptyLines = function (e) {
                    for (var r = this.lineMax; r > e && !(this.bMarks[e] + this.tShift[e] < this.eMarks[e]); e++);
                    return e;
                }, n.prototype.skipSpaces = function (e) {
                    for (var r, t = this.src.length; t > e && (r = this.src.charCodeAt(e), o(r)); e++);
                    return e;
                }, n.prototype.skipSpacesBack = function (e, r) {
                    if (r >= e)
                        return e;
                    for (; e > r;)
                        if (!o(this.src.charCodeAt(--e)))
                            return e + 1;
                    return e;
                }, n.prototype.skipChars = function (e, r) {
                    for (var t = this.src.length; t > e && this.src.charCodeAt(e) === r; e++);
                    return e;
                }, n.prototype.skipCharsBack = function (e, r, t) {
                    if (t >= e)
                        return e;
                    for (; e > t;)
                        if (r !== this.src.charCodeAt(--e))
                            return e + 1;
                    return e;
                }, n.prototype.getLines = function (e, r, t, n) {
                    var s, i, a, c, l, u, p, h = e;
                    if (e >= r)
                        return '';
                    for (u = new Array(r - e), s = 0; r > h; h++, s++) {
                        for (i = 0, p = c = this.bMarks[h], l = r > h + 1 || n ? this.eMarks[h] + 1 : this.eMarks[h]; l > c && t > i;) {
                            if (a = this.src.charCodeAt(c), o(a))
                                9 === a ? i += 4 - i % 4 : i++;
                            else {
                                if (!(c - p < this.tShift[h]))
                                    break;
                                i++;
                            }
                            c++;
                        }
                        u[s] = this.src.slice(c, l);
                    }
                    return u.join('');
                }, n.prototype.Token = s, r.exports = n;
            },
            {
                '../common/utils': 5,
                '../token': 52
            }
        ],
        30: [
            function (e, r, t) {
                'use strict';
                function n(e, r) {
                    var t = e.bMarks[r] + e.blkIndent, n = e.eMarks[r];
                    return e.src.substr(t, n - t);
                }
                function s(e) {
                    var r, t = [], n = 0, s = e.length, o = 0, i = 0, a = !1, c = 0;
                    for (r = e.charCodeAt(n); s > n;)
                        96 === r && o % 2 === 0 ? (a = !a, c = n) : 124 !== r || o % 2 !== 0 || a ? 92 === r ? o++ : o = 0 : (t.push(e.substring(i, n)), i = n + 1), n++, n === s && a && (a = !1, n = c + 1), r = e.charCodeAt(n);
                    return t.push(e.substring(i)), t;
                }
                r.exports = function (e, r, t, o) {
                    var i, a, c, l, u, p, h, f, d, m, g;
                    if (r + 2 > t)
                        return !1;
                    if (u = r + 1, e.sCount[u] < e.blkIndent)
                        return !1;
                    if (c = e.bMarks[u] + e.tShift[u], c >= e.eMarks[u])
                        return !1;
                    if (i = e.src.charCodeAt(c), 124 !== i && 45 !== i && 58 !== i)
                        return !1;
                    if (a = n(e, r + 1), !/^[-:| ]+$/.test(a))
                        return !1;
                    if (p = a.split('|'), p.length < 2)
                        return !1;
                    for (f = [], l = 0; l < p.length; l++) {
                        if (d = p[l].trim(), !d) {
                            if (0 === l || l === p.length - 1)
                                continue;
                            return !1;
                        }
                        if (!/^:?-+:?$/.test(d))
                            return !1;
                        58 === d.charCodeAt(d.length - 1) ? f.push(58 === d.charCodeAt(0) ? 'center' : 'right') : 58 === d.charCodeAt(0) ? f.push('left') : f.push('');
                    }
                    if (a = n(e, r).trim(), -1 === a.indexOf('|'))
                        return !1;
                    if (p = s(a.replace(/^\||\|$/g, '')), f.length !== p.length)
                        return !1;
                    if (o)
                        return !0;
                    for (h = e.push('table_open', 'table', 1), h.map = m = [
                            r,
                            0
                        ], h = e.push('thead_open', 'thead', 1), h.map = [
                            r,
                            r + 1
                        ], h = e.push('tr_open', 'tr', 1), h.map = [
                            r,
                            r + 1
                        ], l = 0; l < p.length; l++)
                        h = e.push('th_open', 'th', 1), h.map = [
                            r,
                            r + 1
                        ], f[l] && (h.attrs = [[
                                'style',
                                'text-align:' + f[l]
                            ]]), h = e.push('inline', '', 0), h.content = p[l].trim(), h.map = [
                            r,
                            r + 1
                        ], h.children = [], h = e.push('th_close', 'th', -1);
                    for (h = e.push('tr_close', 'tr', -1), h = e.push('thead_close', 'thead', -1), h = e.push('tbody_open', 'tbody', 1), h.map = g = [
                            r + 2,
                            0
                        ], u = r + 2; t > u && !(e.sCount[u] < e.blkIndent) && (a = n(e, u).trim(), -1 !== a.indexOf('|')); u++) {
                        for (p = s(a.replace(/^\||\|$/g, '')), p.length = f.length, h = e.push('tr_open', 'tr', 1), l = 0; l < p.length; l++)
                            h = e.push('td_open', 'td', 1), f[l] && (h.attrs = [[
                                    'style',
                                    'text-align:' + f[l]
                                ]]), h = e.push('inline', '', 0), h.content = p[l] ? p[l].trim() : '', h.children = [], h = e.push('td_close', 'td', -1);
                        h = e.push('tr_close', 'tr', -1);
                    }
                    return h = e.push('tbody_close', 'tbody', -1), h = e.push('table_close', 'table', -1), m[1] = g[1] = u, e.line = u, !0;
                };
            },
            {}
        ],
        31: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e) {
                    var r;
                    e.inlineMode ? (r = new e.Token('inline', '', 0), r.content = e.src, r.map = [
                        0,
                        1
                    ], r.children = [], e.tokens.push(r)) : e.md.block.parse(e.src, e.md, e.env, e.tokens);
                };
            },
            {}
        ],
        32: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e) {
                    var r, t, n, s = e.tokens;
                    for (t = 0, n = s.length; n > t; t++)
                        r = s[t], 'inline' === r.type && e.md.inline.parse(r.content, e.md, e.env, r.children);
                };
            },
            {}
        ],
        33: [
            function (e, r, t) {
                'use strict';
                function n(e) {
                    return /^<a[>\s]/i.test(e);
                }
                function s(e) {
                    return /^<\/a\s*>/i.test(e);
                }
                var o = e('../common/utils').arrayReplaceAt;
                r.exports = function (e) {
                    var r, t, i, a, c, l, u, p, h, f, d, m, g, _, k, b, v, x = e.tokens;
                    if (e.md.options.linkify)
                        for (t = 0, i = x.length; i > t; t++)
                            if ('inline' === x[t].type && e.md.linkify.pretest(x[t].content))
                                for (a = x[t].children, g = 0, r = a.length - 1; r >= 0; r--)
                                    if (l = a[r], 'link_close' !== l.type) {
                                        if ('html_inline' === l.type && (n(l.content) && g > 0 && g--, s(l.content) && g++), !(g > 0) && 'text' === l.type && e.md.linkify.test(l.content)) {
                                            for (h = l.content, v = e.md.linkify.match(h), u = [], m = l.level, d = 0, p = 0; p < v.length; p++)
                                                _ = v[p].url, k = e.md.normalizeLink(_), e.md.validateLink(k) && (b = v[p].text, b = v[p].schema ? 'mailto:' !== v[p].schema || /^mailto:/i.test(b) ? e.md.normalizeLinkText(b) : e.md.normalizeLinkText('mailto:' + b).replace(/^mailto:/, '') : e.md.normalizeLinkText('http://' + b).replace(/^http:\/\//, ''), f = v[p].index, f > d && (c = new e.Token('text', '', 0), c.content = h.slice(d, f), c.level = m, u.push(c)), c = new e.Token('link_open', 'a', 1), c.attrs = [[
                                                        'href',
                                                        k
                                                    ]], c.level = m++, c.markup = 'linkify', c.info = 'auto', u.push(c), c = new e.Token('text', '', 0), c.content = b, c.level = m, u.push(c), c = new e.Token('link_close', 'a', -1), c.level = --m, c.markup = 'linkify', c.info = 'auto', u.push(c), d = v[p].lastIndex);
                                            d < h.length && (c = new e.Token('text', '', 0), c.content = h.slice(d), c.level = m, u.push(c)), x[t].children = a = o(a, r, u);
                                        }
                                    } else
                                        for (r--; a[r].level !== l.level && 'link_open' !== a[r].type;)
                                            r--;
                };
            },
            { '../common/utils': 5 }
        ],
        34: [
            function (e, r, t) {
                'use strict';
                var n = /\r[\n\u0085]|[\u2424\u2028\u0085]/g, s = /\u0000/g;
                r.exports = function (e) {
                    var r;
                    r = e.src.replace(n, '\n'), r = r.replace(s, '\uFFFD'), e.src = r;
                };
            },
            {}
        ],
        35: [
            function (e, r, t) {
                'use strict';
                function n(e, r) {
                    return l[r.toLowerCase()];
                }
                function s(e) {
                    var r, t;
                    for (r = e.length - 1; r >= 0; r--)
                        t = e[r], 'text' === t.type && (t.content = t.content.replace(c, n));
                }
                function o(e) {
                    var r, t;
                    for (r = e.length - 1; r >= 0; r--)
                        t = e[r], 'text' === t.type && i.test(t.content) && (t.content = t.content.replace(/\+-/g, '\xB1').replace(/\.{2,}/g, '\u2026').replace(/([?!])\u2026/g, '$1..').replace(/([?!]){4,}/g, '$1$1$1').replace(/,{2,}/g, ',').replace(/(^|[^-])---([^-]|$)/gm, '$1\u2014$2').replace(/(^|\s)--(\s|$)/gm, '$1\u2013$2').replace(/(^|[^-\s])--([^-\s]|$)/gm, '$1\u2013$2'));
                }
                var i = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/, a = /\((c|tm|r|p)\)/i, c = /\((c|tm|r|p)\)/gi, l = {
                        c: '\xA9',
                        r: '\xAE',
                        p: '\xA7',
                        tm: '\u2122'
                    };
                r.exports = function (e) {
                    var r;
                    if (e.md.options.typographer)
                        for (r = e.tokens.length - 1; r >= 0; r--)
                            'inline' === e.tokens[r].type && (a.test(e.tokens[r].content) && s(e.tokens[r].children), i.test(e.tokens[r].content) && o(e.tokens[r].children));
                };
            },
            {}
        ],
        36: [
            function (e, r, t) {
                'use strict';
                function n(e, r, t) {
                    return e.substr(0, r) + t + e.substr(r + 1);
                }
                function s(e, r) {
                    var t, s, c, p, h, f, d, m, g, _, k, b, v, x, y, C, A, w, q, D, E;
                    for (q = [], t = 0; t < e.length; t++) {
                        for (s = e[t], d = e[t].level, A = q.length - 1; A >= 0 && !(q[A].level <= d); A--);
                        if (q.length = A + 1, 'text' === s.type) {
                            c = s.content, h = 0, f = c.length;
                            e:
                                for (; f > h && (l.lastIndex = h, p = l.exec(c));)
                                    if (y = C = !0, h = p.index + 1, w = '\'' === p[0], g = p.index - 1 >= 0 ? c.charCodeAt(p.index - 1) : 32, _ = f > h ? c.charCodeAt(h) : 32, k = a(g) || i(String.fromCharCode(g)), b = a(_) || i(String.fromCharCode(_)), v = o(g), x = o(_), x ? y = !1 : b && (v || k || (y = !1)), v ? C = !1 : k && (x || b || (C = !1)), 34 === _ && '"' === p[0] && g >= 48 && 57 >= g && (C = y = !1), y && C && (y = !1, C = b), y || C) {
                                        if (C)
                                            for (A = q.length - 1; A >= 0 && (m = q[A], !(q[A].level < d)); A--)
                                                if (m.single === w && q[A].level === d) {
                                                    m = q[A], w ? (D = r.md.options.quotes[2], E = r.md.options.quotes[3]) : (D = r.md.options.quotes[0], E = r.md.options.quotes[1]), s.content = n(s.content, p.index, E), e[m.token].content = n(e[m.token].content, m.pos, D), h += E.length - 1, m.token === t && (h += D.length - 1), c = s.content, f = c.length, q.length = A;
                                                    continue e;
                                                }
                                        y ? q.push({
                                            token: t,
                                            pos: p.index,
                                            single: w,
                                            level: d
                                        }) : C && w && (s.content = n(s.content, p.index, u));
                                    } else
                                        w && (s.content = n(s.content, p.index, u));
                        }
                    }
                }
                var o = e('../common/utils').isWhiteSpace, i = e('../common/utils').isPunctChar, a = e('../common/utils').isMdAsciiPunct, c = /['"]/, l = /['"]/g, u = '\u2019';
                r.exports = function (e) {
                    var r;
                    if (e.md.options.typographer)
                        for (r = e.tokens.length - 1; r >= 0; r--)
                            'inline' === e.tokens[r].type && c.test(e.tokens[r].content) && s(e.tokens[r].children, e);
                };
            },
            { '../common/utils': 5 }
        ],
        37: [
            function (e, r, t) {
                'use strict';
                function n(e, r, t) {
                    this.src = e, this.env = t, this.tokens = [], this.inlineMode = !1, this.md = r;
                }
                var s = e('../token');
                n.prototype.Token = s, r.exports = n;
            },
            { '../token': 52 }
        ],
        38: [
            function (e, r, t) {
                'use strict';
                var n = e('../common/url_schemas'), s = /^<([a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/, o = /^<([a-zA-Z.\-]{1,25}):([^<>\x00-\x20]*)>/;
                r.exports = function (e, r) {
                    var t, i, a, c, l, u, p = e.pos;
                    return 60 !== e.src.charCodeAt(p) ? !1 : (t = e.src.slice(p), t.indexOf('>') < 0 ? !1 : o.test(t) ? (i = t.match(o), n.indexOf(i[1].toLowerCase()) < 0 ? !1 : (c = i[0].slice(1, -1), l = e.md.normalizeLink(c), e.md.validateLink(l) ? (r || (u = e.push('link_open', 'a', 1), u.attrs = [[
                            'href',
                            l
                        ]], u = e.push('text', '', 0), u.content = e.md.normalizeLinkText(c), u = e.push('link_close', 'a', -1)), e.pos += i[0].length, !0) : !1)) : s.test(t) ? (a = t.match(s), c = a[0].slice(1, -1), l = e.md.normalizeLink('mailto:' + c), e.md.validateLink(l) ? (r || (u = e.push('link_open', 'a', 1), u.attrs = [[
                            'href',
                            l
                        ]], u.markup = 'autolink', u.info = 'auto', u = e.push('text', '', 0), u.content = e.md.normalizeLinkText(c), u = e.push('link_close', 'a', -1), u.markup = 'autolink', u.info = 'auto'), e.pos += a[0].length, !0) : !1) : !1);
                };
            },
            { '../common/url_schemas': 4 }
        ],
        39: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e, r) {
                    var t, n, s, o, i, a, c = e.pos, l = e.src.charCodeAt(c);
                    if (96 !== l)
                        return !1;
                    for (t = c, c++, n = e.posMax; n > c && 96 === e.src.charCodeAt(c);)
                        c++;
                    for (s = e.src.slice(t, c), o = i = c; -1 !== (o = e.src.indexOf('`', i));) {
                        for (i = o + 1; n > i && 96 === e.src.charCodeAt(i);)
                            i++;
                        if (i - o === s.length)
                            return r || (a = e.push('code_inline', 'code', 0), a.markup = s, a.content = e.src.slice(c, o).replace(/[ \n]+/g, ' ').trim()), e.pos = i, !0;
                    }
                    return r || (e.pending += s), e.pos += s.length, !0;
                };
            },
            {}
        ],
        40: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e) {
                    var r, t, n, s, o = e.delimiters, i = e.delimiters.length;
                    for (r = 0; i > r; r++)
                        if (n = o[r], n.close)
                            for (t = r - n.jump - 1; t >= 0;) {
                                if (s = o[t], s.open && s.marker === n.marker && s.end < 0 && s.level === n.level) {
                                    n.jump = r - t, n.open = !1, s.end = r, s.jump = 0;
                                    break;
                                }
                                t -= s.jump + 1;
                            }
                };
            },
            {}
        ],
        41: [
            function (e, r, t) {
                'use strict';
                r.exports.tokenize = function (e, r) {
                    var t, n, s, o = e.pos, i = e.src.charCodeAt(o);
                    if (r)
                        return !1;
                    if (95 !== i && 42 !== i)
                        return !1;
                    for (n = e.scanDelims(e.pos, 42 === i), t = 0; t < n.length; t++)
                        s = e.push('text', '', 0), s.content = String.fromCharCode(i), e.delimiters.push({
                            marker: i,
                            jump: t,
                            token: e.tokens.length - 1,
                            level: e.level,
                            end: -1,
                            open: n.can_open,
                            close: n.can_close
                        });
                    return e.pos += n.length, !0;
                }, r.exports.postProcess = function (e) {
                    var r, t, n, s, o, i, a = e.delimiters, c = e.delimiters.length;
                    for (r = 0; c > r; r++)
                        t = a[r], (95 === t.marker || 42 === t.marker) && -1 !== t.end && (n = a[t.end], i = c > r + 1 && a[r + 1].end === t.end - 1 && a[r + 1].token === t.token + 1 && a[t.end - 1].token === n.token - 1 && a[r + 1].marker === t.marker, o = String.fromCharCode(t.marker), s = e.tokens[t.token], s.type = i ? 'strong_open' : 'em_open', s.tag = i ? 'strong' : 'em', s.nesting = 1, s.markup = i ? o + o : o, s.content = '', s = e.tokens[n.token], s.type = i ? 'strong_close' : 'em_close', s.tag = i ? 'strong' : 'em', s.nesting = -1, s.markup = i ? o + o : o, s.content = '', i && (e.tokens[a[r + 1].token].content = '', e.tokens[a[t.end - 1].token].content = '', r++));
                };
            },
            {}
        ],
        42: [
            function (e, r, t) {
                'use strict';
                var n = e('../common/entities'), s = e('../common/utils').has, o = e('../common/utils').isValidEntityCode, i = e('../common/utils').fromCodePoint, a = /^&#((?:x[a-f0-9]{1,8}|[0-9]{1,8}));/i, c = /^&([a-z][a-z0-9]{1,31});/i;
                r.exports = function (e, r) {
                    var t, l, u, p = e.pos, h = e.posMax;
                    if (38 !== e.src.charCodeAt(p))
                        return !1;
                    if (h > p + 1)
                        if (t = e.src.charCodeAt(p + 1), 35 === t) {
                            if (u = e.src.slice(p).match(a))
                                return r || (l = 'x' === u[1][0].toLowerCase() ? parseInt(u[1].slice(1), 16) : parseInt(u[1], 10), e.pending += i(o(l) ? l : 65533)), e.pos += u[0].length, !0;
                        } else if (u = e.src.slice(p).match(c), u && s(n, u[1]))
                            return r || (e.pending += n[u[1]]), e.pos += u[0].length, !0;
                    return r || (e.pending += '&'), e.pos++, !0;
                };
            },
            {
                '../common/entities': 1,
                '../common/utils': 5
            }
        ],
        43: [
            function (e, r, t) {
                'use strict';
                for (var n = e('../common/utils').isSpace, s = [], o = 0; 256 > o; o++)
                    s.push(0);
                '\\!"#$%&\'()*+,./:;<=>?@[]^_`{|}~-'.split('').forEach(function (e) {
                    s[e.charCodeAt(0)] = 1;
                }), r.exports = function (e, r) {
                    var t, o = e.pos, i = e.posMax;
                    if (92 !== e.src.charCodeAt(o))
                        return !1;
                    if (o++, i > o) {
                        if (t = e.src.charCodeAt(o), 256 > t && 0 !== s[t])
                            return r || (e.pending += e.src[o]), e.pos += 2, !0;
                        if (10 === t) {
                            for (r || e.push('hardbreak', 'br', 0), o++; i > o && (t = e.src.charCodeAt(o), n(t));)
                                o++;
                            return e.pos = o, !0;
                        }
                    }
                    return r || (e.pending += '\\'), e.pos++, !0;
                };
            },
            { '../common/utils': 5 }
        ],
        44: [
            function (e, r, t) {
                'use strict';
                function n(e) {
                    var r = 32 | e;
                    return r >= 97 && 122 >= r;
                }
                var s = e('../common/html_re').HTML_TAG_RE;
                r.exports = function (e, r) {
                    var t, o, i, a, c = e.pos;
                    return e.md.options.html ? (i = e.posMax, 60 !== e.src.charCodeAt(c) || c + 2 >= i ? !1 : (t = e.src.charCodeAt(c + 1), (33 === t || 63 === t || 47 === t || n(t)) && (o = e.src.slice(c).match(s)) ? (r || (a = e.push('html_inline', '', 0), a.content = e.src.slice(c, c + o[0].length)), e.pos += o[0].length, !0) : !1)) : !1;
                };
            },
            { '../common/html_re': 3 }
        ],
        45: [
            function (e, r, t) {
                'use strict';
                var n = e('../helpers/parse_link_label'), s = e('../helpers/parse_link_destination'), o = e('../helpers/parse_link_title'), i = e('../common/utils').normalizeReference, a = e('../common/utils').isSpace;
                r.exports = function (e, r) {
                    var t, c, l, u, p, h, f, d, m, g, _, k, b = '', v = e.pos, x = e.posMax;
                    if (33 !== e.src.charCodeAt(e.pos))
                        return !1;
                    if (91 !== e.src.charCodeAt(e.pos + 1))
                        return !1;
                    if (p = e.pos + 2, u = n(e, e.pos + 1, !1), 0 > u)
                        return !1;
                    if (h = u + 1, x > h && 40 === e.src.charCodeAt(h)) {
                        for (h++; x > h && (c = e.src.charCodeAt(h), a(c) || 10 === c); h++);
                        if (h >= x)
                            return !1;
                        for (k = h, d = s(e.src, h, e.posMax), d.ok && (b = e.md.normalizeLink(d.str), e.md.validateLink(b) ? h = d.pos : b = ''), k = h; x > h && (c = e.src.charCodeAt(h), a(c) || 10 === c); h++);
                        if (d = o(e.src, h, e.posMax), x > h && k !== h && d.ok)
                            for (m = d.str, h = d.pos; x > h && (c = e.src.charCodeAt(h), a(c) || 10 === c); h++);
                        else
                            m = '';
                        if (h >= x || 41 !== e.src.charCodeAt(h))
                            return e.pos = v, !1;
                        h++;
                    } else {
                        if ('undefined' == typeof e.env.references)
                            return !1;
                        for (; x > h && (c = e.src.charCodeAt(h), a(c) || 10 === c); h++);
                        if (x > h && 91 === e.src.charCodeAt(h) ? (k = h + 1, h = n(e, h), h >= 0 ? l = e.src.slice(k, h++) : h = u + 1) : h = u + 1, l || (l = e.src.slice(p, u)), f = e.env.references[i(l)], !f)
                            return e.pos = v, !1;
                        b = f.href, m = f.title;
                    }
                    return r || (e.md.inline.parse(e.src.slice(p, u), e.md, e.env, _ = []), g = e.push('image', 'img', 0), g.attrs = t = [
                        [
                            'src',
                            b
                        ],
                        [
                            'alt',
                            ''
                        ]
                    ], g.children = _, m && t.push([
                        'title',
                        m
                    ])), e.pos = h, e.posMax = x, !0;
                };
            },
            {
                '../common/utils': 5,
                '../helpers/parse_link_destination': 7,
                '../helpers/parse_link_label': 8,
                '../helpers/parse_link_title': 9
            }
        ],
        46: [
            function (e, r, t) {
                'use strict';
                var n = e('../helpers/parse_link_label'), s = e('../helpers/parse_link_destination'), o = e('../helpers/parse_link_title'), i = e('../common/utils').normalizeReference, a = e('../common/utils').isSpace;
                r.exports = function (e, r) {
                    var t, c, l, u, p, h, f, d, m, g, _ = '', k = e.pos, b = e.posMax, v = e.pos;
                    if (91 !== e.src.charCodeAt(e.pos))
                        return !1;
                    if (p = e.pos + 1, u = n(e, e.pos, !0), 0 > u)
                        return !1;
                    if (h = u + 1, b > h && 40 === e.src.charCodeAt(h)) {
                        for (h++; b > h && (c = e.src.charCodeAt(h), a(c) || 10 === c); h++);
                        if (h >= b)
                            return !1;
                        for (v = h, f = s(e.src, h, e.posMax), f.ok && (_ = e.md.normalizeLink(f.str), e.md.validateLink(_) ? h = f.pos : _ = ''), v = h; b > h && (c = e.src.charCodeAt(h), a(c) || 10 === c); h++);
                        if (f = o(e.src, h, e.posMax), b > h && v !== h && f.ok)
                            for (m = f.str, h = f.pos; b > h && (c = e.src.charCodeAt(h), a(c) || 10 === c); h++);
                        else
                            m = '';
                        if (h >= b || 41 !== e.src.charCodeAt(h))
                            return e.pos = k, !1;
                        h++;
                    } else {
                        if ('undefined' == typeof e.env.references)
                            return !1;
                        for (; b > h && (c = e.src.charCodeAt(h), a(c) || 10 === c); h++);
                        if (b > h && 91 === e.src.charCodeAt(h) ? (v = h + 1, h = n(e, h), h >= 0 ? l = e.src.slice(v, h++) : h = u + 1) : h = u + 1, l || (l = e.src.slice(p, u)), d = e.env.references[i(l)], !d)
                            return e.pos = k, !1;
                        _ = d.href, m = d.title;
                    }
                    return r || (e.pos = p, e.posMax = u, g = e.push('link_open', 'a', 1), g.attrs = t = [[
                            'href',
                            _
                        ]], m && t.push([
                        'title',
                        m
                    ]), e.md.inline.tokenize(e), g = e.push('link_close', 'a', -1)), e.pos = h, e.posMax = b, !0;
                };
            },
            {
                '../common/utils': 5,
                '../helpers/parse_link_destination': 7,
                '../helpers/parse_link_label': 8,
                '../helpers/parse_link_title': 9
            }
        ],
        47: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e, r) {
                    var t, n, s = e.pos;
                    if (10 !== e.src.charCodeAt(s))
                        return !1;
                    for (t = e.pending.length - 1, n = e.posMax, r || (t >= 0 && 32 === e.pending.charCodeAt(t) ? t >= 1 && 32 === e.pending.charCodeAt(t - 1) ? (e.pending = e.pending.replace(/ +$/, ''), e.push('hardbreak', 'br', 0)) : (e.pending = e.pending.slice(0, -1), e.push('softbreak', 'br', 0)) : e.push('softbreak', 'br', 0)), s++; n > s && 32 === e.src.charCodeAt(s);)
                        s++;
                    return e.pos = s, !0;
                };
            },
            {}
        ],
        48: [
            function (e, r, t) {
                'use strict';
                function n(e, r, t, n) {
                    this.src = e, this.env = t, this.md = r, this.tokens = n, this.pos = 0, this.posMax = this.src.length, this.level = 0, this.pending = '', this.pendingLevel = 0, this.cache = {}, this.delimiters = [];
                }
                var s = e('../token'), o = e('../common/utils').isWhiteSpace, i = e('../common/utils').isPunctChar, a = e('../common/utils').isMdAsciiPunct;
                n.prototype.pushPending = function () {
                    var e = new s('text', '', 0);
                    return e.content = this.pending, e.level = this.pendingLevel, this.tokens.push(e), this.pending = '', e;
                }, n.prototype.push = function (e, r, t) {
                    this.pending && this.pushPending();
                    var n = new s(e, r, t);
                    return 0 > t && this.level--, n.level = this.level, t > 0 && this.level++, this.pendingLevel = this.level, this.tokens.push(n), n;
                }, n.prototype.scanDelims = function (e, r) {
                    var t, n, s, c, l, u, p, h, f, d = e, m = !0, g = !0, _ = this.posMax, k = this.src.charCodeAt(e);
                    for (t = e > 0 ? this.src.charCodeAt(e - 1) : 32; _ > d && this.src.charCodeAt(d) === k;)
                        d++;
                    return s = d - e, n = _ > d ? this.src.charCodeAt(d) : 32, p = a(t) || i(String.fromCharCode(t)), f = a(n) || i(String.fromCharCode(n)), u = o(t), h = o(n), h ? m = !1 : f && (u || p || (m = !1)), u ? g = !1 : p && (h || f || (g = !1)), r ? (c = m, l = g) : (c = m && (!g || p), l = g && (!m || f)), {
                        can_open: c,
                        can_close: l,
                        length: s
                    };
                }, n.prototype.Token = s, r.exports = n;
            },
            {
                '../common/utils': 5,
                '../token': 52
            }
        ],
        49: [
            function (e, r, t) {
                'use strict';
                r.exports.tokenize = function (e, r) {
                    var t, n, s, o, i, a = e.pos, c = e.src.charCodeAt(a);
                    if (r)
                        return !1;
                    if (126 !== c)
                        return !1;
                    if (n = e.scanDelims(e.pos, !0), o = n.length, i = String.fromCharCode(c), 2 > o)
                        return !1;
                    for (o % 2 && (s = e.push('text', '', 0), s.content = i, o--), t = 0; o > t; t += 2)
                        s = e.push('text', '', 0), s.content = i + i, e.delimiters.push({
                            marker: c,
                            jump: t,
                            token: e.tokens.length - 1,
                            level: e.level,
                            end: -1,
                            open: n.can_open,
                            close: n.can_close
                        });
                    return e.pos += n.length, !0;
                }, r.exports.postProcess = function (e) {
                    var r, t, n, s, o, i = [], a = e.delimiters, c = e.delimiters.length;
                    for (r = 0; c > r; r++)
                        n = a[r], 126 === n.marker && -1 !== n.end && (s = a[n.end], o = e.tokens[n.token], o.type = 's_open', o.tag = 's', o.nesting = 1, o.markup = '~~', o.content = '', o = e.tokens[s.token], o.type = 's_close', o.tag = 's', o.nesting = -1, o.markup = '~~', o.content = '', 'text' === e.tokens[s.token - 1].type && '~' === e.tokens[s.token - 1].content && i.push(s.token - 1));
                    for (; i.length;) {
                        for (r = i.pop(), t = r + 1; t < e.tokens.length && 's_close' === e.tokens[t].type;)
                            t++;
                        t--, r !== t && (o = e.tokens[t], e.tokens[t] = e.tokens[r], e.tokens[r] = o);
                    }
                };
            },
            {}
        ],
        50: [
            function (e, r, t) {
                'use strict';
                function n(e) {
                    switch (e) {
                    case 10:
                    case 33:
                    case 35:
                    case 36:
                    case 37:
                    case 38:
                    case 42:
                    case 43:
                    case 45:
                    case 58:
                    case 60:
                    case 61:
                    case 62:
                    case 64:
                    case 91:
                    case 92:
                    case 93:
                    case 94:
                    case 95:
                    case 96:
                    case 123:
                    case 125:
                    case 126:
                        return !0;
                    default:
                        return !1;
                    }
                }
                r.exports = function (e, r) {
                    for (var t = e.pos; t < e.posMax && !n(e.src.charCodeAt(t));)
                        t++;
                    return t === e.pos ? !1 : (r || (e.pending += e.src.slice(e.pos, t)), e.pos = t, !0);
                };
            },
            {}
        ],
        51: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e) {
                    var r, t, n = 0, s = e.tokens, o = e.tokens.length;
                    for (r = t = 0; o > r; r++)
                        n += s[r].nesting, s[r].level = n, 'text' === s[r].type && o > r + 1 && 'text' === s[r + 1].type ? s[r + 1].content = s[r].content + s[r + 1].content : (r !== t && (s[t] = s[r]), t++);
                    r !== t && (s.length = t);
                };
            },
            {}
        ],
        52: [
            function (e, r, t) {
                'use strict';
                function n(e, r, t) {
                    this.type = e, this.tag = r, this.attrs = null, this.map = null, this.nesting = t, this.level = 0, this.children = null, this.content = '', this.markup = '', this.info = '', this.meta = null, this.block = !1, this.hidden = !1;
                }
                n.prototype.attrIndex = function (e) {
                    var r, t, n;
                    if (!this.attrs)
                        return -1;
                    for (r = this.attrs, t = 0, n = r.length; n > t; t++)
                        if (r[t][0] === e)
                            return t;
                    return -1;
                }, n.prototype.attrPush = function (e) {
                    this.attrs ? this.attrs.push(e) : this.attrs = [e];
                }, r.exports = n;
            },
            {}
        ],
        53: [
            function (r, t, n) {
                (function (r) {
                    !function (s) {
                        function o(e) {
                            throw RangeError(R[e]);
                        }
                        function i(e, r) {
                            for (var t = e.length, n = []; t--;)
                                n[t] = r(e[t]);
                            return n;
                        }
                        function a(e, r) {
                            var t = e.split('@'), n = '';
                            t.length > 1 && (n = t[0] + '@', e = t[1]), e = e.replace(T, '.');
                            var s = e.split('.'), o = i(s, r).join('.');
                            return n + o;
                        }
                        function c(e) {
                            for (var r, t, n = [], s = 0, o = e.length; o > s;)
                                r = e.charCodeAt(s++), r >= 55296 && 56319 >= r && o > s ? (t = e.charCodeAt(s++), 56320 == (64512 & t) ? n.push(((1023 & r) << 10) + (1023 & t) + 65536) : (n.push(r), s--)) : n.push(r);
                            return n;
                        }
                        function l(e) {
                            return i(e, function (e) {
                                var r = '';
                                return e > 65535 && (e -= 65536, r += B(e >>> 10 & 1023 | 55296), e = 56320 | 1023 & e), r += B(e);
                            }).join('');
                        }
                        function u(e) {
                            return 10 > e - 48 ? e - 22 : 26 > e - 65 ? e - 65 : 26 > e - 97 ? e - 97 : C;
                        }
                        function p(e, r) {
                            return e + 22 + 75 * (26 > e) - ((0 != r) << 5);
                        }
                        function h(e, r, t) {
                            var n = 0;
                            for (e = t ? I(e / D) : e >> 1, e += I(e / r); e > M * w >> 1; n += C)
                                e = I(e / M);
                            return I(n + (M + 1) * e / (e + q));
                        }
                        function f(e) {
                            var r, t, n, s, i, a, c, p, f, d, m = [], g = e.length, _ = 0, k = S, b = E;
                            for (t = e.lastIndexOf(F), 0 > t && (t = 0), n = 0; t > n; ++n)
                                e.charCodeAt(n) >= 128 && o('not-basic'), m.push(e.charCodeAt(n));
                            for (s = t > 0 ? t + 1 : 0; g > s;) {
                                for (i = _, a = 1, c = C; s >= g && o('invalid-input'), p = u(e.charCodeAt(s++)), (p >= C || p > I((y - _) / a)) && o('overflow'), _ += p * a, f = b >= c ? A : c >= b + w ? w : c - b, !(f > p); c += C)
                                    d = C - f, a > I(y / d) && o('overflow'), a *= d;
                                r = m.length + 1, b = h(_ - i, r, 0 == i), I(_ / r) > y - k && o('overflow'), k += I(_ / r), _ %= r, m.splice(_++, 0, k);
                            }
                            return l(m);
                        }
                        function d(e) {
                            var r, t, n, s, i, a, l, u, f, d, m, g, _, k, b, v = [];
                            for (e = c(e), g = e.length, r = S, t = 0, i = E, a = 0; g > a; ++a)
                                m = e[a], 128 > m && v.push(B(m));
                            for (n = s = v.length, s && v.push(F); g > n;) {
                                for (l = y, a = 0; g > a; ++a)
                                    m = e[a], m >= r && l > m && (l = m);
                                for (_ = n + 1, l - r > I((y - t) / _) && o('overflow'), t += (l - r) * _, r = l, a = 0; g > a; ++a)
                                    if (m = e[a], r > m && ++t > y && o('overflow'), m == r) {
                                        for (u = t, f = C; d = i >= f ? A : f >= i + w ? w : f - i, !(d > u); f += C)
                                            b = u - d, k = C - d, v.push(B(p(d + b % k, 0))), u = I(b / k);
                                        v.push(B(p(u, 0))), i = h(t, _, n == s), t = 0, ++n;
                                    }
                                ++t, ++r;
                            }
                            return v.join('');
                        }
                        function m(e) {
                            return a(e, function (e) {
                                return z.test(e) ? f(e.slice(4).toLowerCase()) : e;
                            });
                        }
                        function g(e) {
                            return a(e, function (e) {
                                return L.test(e) ? 'xn--' + d(e) : e;
                            });
                        }
                        var _ = 'object' == typeof n && n && !n.nodeType && n, k = 'object' == typeof t && t && !t.nodeType && t, b = 'object' == typeof r && r;
                        (b.global === b || b.window === b || b.self === b) && (s = b);
                        var v, x, y = 2147483647, C = 36, A = 1, w = 26, q = 38, D = 700, E = 72, S = 128, F = '-', z = /^xn--/, L = /[^\x20-\x7E]/, T = /[\x2E\u3002\uFF0E\uFF61]/g, R = {
                                overflow: 'Overflow: input needs wider integers to process',
                                'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
                                'invalid-input': 'Invalid input'
                            }, M = C - A, I = Math.floor, B = String.fromCharCode;
                        if (v = {
                                version: '1.3.2',
                                ucs2: {
                                    decode: c,
                                    encode: l
                                },
                                decode: f,
                                encode: d,
                                toASCII: g,
                                toUnicode: m
                            }, 'function' == typeof e && 'object' == typeof e.amd && e.amd)
                            e('punycode', function () {
                                return v;
                            });
                        else if (_ && k)
                            if (t.exports == _)
                                k.exports = v;
                            else
                                for (x in v)
                                    v.hasOwnProperty(x) && (_[x] = v[x]);
                        else
                            s.punycode = v;
                    }(this);
                }.call(this, 'undefined' != typeof global ? global : 'undefined' != typeof self ? self : 'undefined' != typeof window ? window : {}));
            },
            {}
        ],
        54: [
            function (e, r, t) {
                r.exports = {
                    Aacute: 'Á',
                    aacute: 'á',
                    Abreve: 'Ă',
                    abreve: 'ă',
                    ac: '\u223E',
                    acd: '\u223F',
                    acE: '\u223E̳',
                    Acirc: 'Â',
                    acirc: 'â',
                    acute: '\xB4',
                    Acy: 'А',
                    acy: 'а',
                    AElig: 'Æ',
                    aelig: 'æ',
                    af: '\u2061',
                    Afr: '\uD835\uDD04',
                    afr: '\uD835\uDD1E',
                    Agrave: 'À',
                    agrave: 'à',
                    alefsym: 'ℵ',
                    aleph: 'ℵ',
                    Alpha: 'Α',
                    alpha: 'α',
                    Amacr: 'Ā',
                    amacr: 'ā',
                    amalg: '\u2A3F',
                    amp: '&',
                    AMP: '&',
                    andand: '\u2A55',
                    And: '\u2A53',
                    and: '\u2227',
                    andd: '\u2A5C',
                    andslope: '\u2A58',
                    andv: '\u2A5A',
                    ang: '\u2220',
                    ange: '\u29A4',
                    angle: '\u2220',
                    angmsdaa: '\u29A8',
                    angmsdab: '\u29A9',
                    angmsdac: '\u29AA',
                    angmsdad: '\u29AB',
                    angmsdae: '\u29AC',
                    angmsdaf: '\u29AD',
                    angmsdag: '\u29AE',
                    angmsdah: '\u29AF',
                    angmsd: '\u2221',
                    angrt: '\u221F',
                    angrtvb: '\u22BE',
                    angrtvbd: '\u299D',
                    angsph: '\u2222',
                    angst: 'Å',
                    angzarr: '\u237C',
                    Aogon: 'Ą',
                    aogon: 'ą',
                    Aopf: '\uD835\uDD38',
                    aopf: '\uD835\uDD52',
                    apacir: '\u2A6F',
                    ap: '\u2248',
                    apE: '\u2A70',
                    ape: '\u224A',
                    apid: '\u224B',
                    apos: '\'',
                    ApplyFunction: '\u2061',
                    approx: '\u2248',
                    approxeq: '\u224A',
                    Aring: 'Å',
                    aring: 'å',
                    Ascr: '\uD835\uDC9C',
                    ascr: '\uD835\uDCB6',
                    Assign: '\u2254',
                    ast: '*',
                    asymp: '\u2248',
                    asympeq: '\u224D',
                    Atilde: 'Ã',
                    atilde: 'ã',
                    Auml: 'Ä',
                    auml: 'ä',
                    awconint: '\u2233',
                    awint: '\u2A11',
                    backcong: '\u224C',
                    backepsilon: '\u03F6',
                    backprime: '\u2035',
                    backsim: '\u223D',
                    backsimeq: '\u22CD',
                    Backslash: '\u2216',
                    Barv: '\u2AE7',
                    barvee: '\u22BD',
                    barwed: '\u2305',
                    Barwed: '\u2306',
                    barwedge: '\u2305',
                    bbrk: '\u23B5',
                    bbrktbrk: '\u23B6',
                    bcong: '\u224C',
                    Bcy: 'Б',
                    bcy: 'б',
                    bdquo: '\u201E',
                    becaus: '\u2235',
                    because: '\u2235',
                    Because: '\u2235',
                    bemptyv: '\u29B0',
                    bepsi: '\u03F6',
                    bernou: 'ℬ',
                    Bernoullis: 'ℬ',
                    Beta: 'Β',
                    beta: 'β',
                    beth: 'ℶ',
                    between: '\u226C',
                    Bfr: '\uD835\uDD05',
                    bfr: '\uD835\uDD1F',
                    bigcap: '\u22C2',
                    bigcirc: '\u25EF',
                    bigcup: '\u22C3',
                    bigodot: '\u2A00',
                    bigoplus: '\u2A01',
                    bigotimes: '\u2A02',
                    bigsqcup: '\u2A06',
                    bigstar: '\u2605',
                    bigtriangledown: '\u25BD',
                    bigtriangleup: '\u25B3',
                    biguplus: '\u2A04',
                    bigvee: '\u22C1',
                    bigwedge: '\u22C0',
                    bkarow: '\u290D',
                    blacklozenge: '\u29EB',
                    blacksquare: '\u25AA',
                    blacktriangle: '\u25B4',
                    blacktriangledown: '\u25BE',
                    blacktriangleleft: '\u25C2',
                    blacktriangleright: '\u25B8',
                    blank: '\u2423',
                    blk12: '\u2592',
                    blk14: '\u2591',
                    blk34: '\u2593',
                    block: '\u2588',
                    bne: '=⃥',
                    bnequiv: '\u2261⃥',
                    bNot: '\u2AED',
                    bnot: '\u2310',
                    Bopf: '\uD835\uDD39',
                    bopf: '\uD835\uDD53',
                    bot: '\u22A5',
                    bottom: '\u22A5',
                    bowtie: '\u22C8',
                    boxbox: '\u29C9',
                    boxdl: '\u2510',
                    boxdL: '\u2555',
                    boxDl: '\u2556',
                    boxDL: '\u2557',
                    boxdr: '\u250C',
                    boxdR: '\u2552',
                    boxDr: '\u2553',
                    boxDR: '\u2554',
                    boxh: '\u2500',
                    boxH: '\u2550',
                    boxhd: '\u252C',
                    boxHd: '\u2564',
                    boxhD: '\u2565',
                    boxHD: '\u2566',
                    boxhu: '\u2534',
                    boxHu: '\u2567',
                    boxhU: '\u2568',
                    boxHU: '\u2569',
                    boxminus: '\u229F',
                    boxplus: '\u229E',
                    boxtimes: '\u22A0',
                    boxul: '\u2518',
                    boxuL: '\u255B',
                    boxUl: '\u255C',
                    boxUL: '\u255D',
                    boxur: '\u2514',
                    boxuR: '\u2558',
                    boxUr: '\u2559',
                    boxUR: '\u255A',
                    boxv: '\u2502',
                    boxV: '\u2551',
                    boxvh: '\u253C',
                    boxvH: '\u256A',
                    boxVh: '\u256B',
                    boxVH: '\u256C',
                    boxvl: '\u2524',
                    boxvL: '\u2561',
                    boxVl: '\u2562',
                    boxVL: '\u2563',
                    boxvr: '\u251C',
                    boxvR: '\u255E',
                    boxVr: '\u255F',
                    boxVR: '\u2560',
                    bprime: '\u2035',
                    breve: '\u02D8',
                    Breve: '\u02D8',
                    brvbar: '\xA6',
                    bscr: '\uD835\uDCB7',
                    Bscr: 'ℬ',
                    bsemi: '\u204F',
                    bsim: '\u223D',
                    bsime: '\u22CD',
                    bsolb: '\u29C5',
                    bsol: '\\',
                    bsolhsub: '\u27C8',
                    bull: '\u2022',
                    bullet: '\u2022',
                    bump: '\u224E',
                    bumpE: '\u2AAE',
                    bumpe: '\u224F',
                    Bumpeq: '\u224E',
                    bumpeq: '\u224F',
                    Cacute: 'Ć',
                    cacute: 'ć',
                    capand: '\u2A44',
                    capbrcup: '\u2A49',
                    capcap: '\u2A4B',
                    cap: '\u2229',
                    Cap: '\u22D2',
                    capcup: '\u2A47',
                    capdot: '\u2A40',
                    CapitalDifferentialD: 'ⅅ',
                    caps: '\u2229︀',
                    caret: '\u2041',
                    caron: 'ˇ',
                    Cayleys: 'ℭ',
                    ccaps: '\u2A4D',
                    Ccaron: 'Č',
                    ccaron: 'č',
                    Ccedil: 'Ç',
                    ccedil: 'ç',
                    Ccirc: 'Ĉ',
                    ccirc: 'ĉ',
                    Cconint: '\u2230',
                    ccups: '\u2A4C',
                    ccupssm: '\u2A50',
                    Cdot: 'Ċ',
                    cdot: 'ċ',
                    cedil: '\xB8',
                    Cedilla: '\xB8',
                    cemptyv: '\u29B2',
                    cent: '\xA2',
                    centerdot: '\xB7',
                    CenterDot: '\xB7',
                    cfr: '\uD835\uDD20',
                    Cfr: 'ℭ',
                    CHcy: 'Ч',
                    chcy: 'ч',
                    check: '\u2713',
                    checkmark: '\u2713',
                    Chi: 'Χ',
                    chi: 'χ',
                    circ: 'ˆ',
                    circeq: '\u2257',
                    circlearrowleft: '\u21BA',
                    circlearrowright: '\u21BB',
                    circledast: '\u229B',
                    circledcirc: '\u229A',
                    circleddash: '\u229D',
                    CircleDot: '\u2299',
                    circledR: '\xAE',
                    circledS: '\u24C8',
                    CircleMinus: '\u2296',
                    CirclePlus: '\u2295',
                    CircleTimes: '\u2297',
                    cir: '\u25CB',
                    cirE: '\u29C3',
                    cire: '\u2257',
                    cirfnint: '\u2A10',
                    cirmid: '\u2AEF',
                    cirscir: '\u29C2',
                    ClockwiseContourIntegral: '\u2232',
                    CloseCurlyDoubleQuote: '\u201D',
                    CloseCurlyQuote: '\u2019',
                    clubs: '\u2663',
                    clubsuit: '\u2663',
                    colon: ':',
                    Colon: '\u2237',
                    Colone: '\u2A74',
                    colone: '\u2254',
                    coloneq: '\u2254',
                    comma: ',',
                    commat: '@',
                    comp: '\u2201',
                    compfn: '\u2218',
                    complement: '\u2201',
                    complexes: 'ℂ',
                    cong: '\u2245',
                    congdot: '\u2A6D',
                    Congruent: '\u2261',
                    conint: '\u222E',
                    Conint: '\u222F',
                    ContourIntegral: '\u222E',
                    copf: '\uD835\uDD54',
                    Copf: 'ℂ',
                    coprod: '\u2210',
                    Coproduct: '\u2210',
                    copy: '\xA9',
                    COPY: '\xA9',
                    copysr: '\u2117',
                    CounterClockwiseContourIntegral: '\u2233',
                    crarr: '\u21B5',
                    cross: '\u2717',
                    Cross: '\u2A2F',
                    Cscr: '\uD835\uDC9E',
                    cscr: '\uD835\uDCB8',
                    csub: '\u2ACF',
                    csube: '\u2AD1',
                    csup: '\u2AD0',
                    csupe: '\u2AD2',
                    ctdot: '\u22EF',
                    cudarrl: '\u2938',
                    cudarrr: '\u2935',
                    cuepr: '\u22DE',
                    cuesc: '\u22DF',
                    cularr: '\u21B6',
                    cularrp: '\u293D',
                    cupbrcap: '\u2A48',
                    cupcap: '\u2A46',
                    CupCap: '\u224D',
                    cup: '\u222A',
                    Cup: '\u22D3',
                    cupcup: '\u2A4A',
                    cupdot: '\u228D',
                    cupor: '\u2A45',
                    cups: '\u222A︀',
                    curarr: '\u21B7',
                    curarrm: '\u293C',
                    curlyeqprec: '\u22DE',
                    curlyeqsucc: '\u22DF',
                    curlyvee: '\u22CE',
                    curlywedge: '\u22CF',
                    curren: '\xA4',
                    curvearrowleft: '\u21B6',
                    curvearrowright: '\u21B7',
                    cuvee: '\u22CE',
                    cuwed: '\u22CF',
                    cwconint: '\u2232',
                    cwint: '\u2231',
                    cylcty: '\u232D',
                    dagger: '\u2020',
                    Dagger: '\u2021',
                    daleth: 'ℸ',
                    darr: '\u2193',
                    Darr: '\u21A1',
                    dArr: '\u21D3',
                    dash: '\u2010',
                    Dashv: '\u2AE4',
                    dashv: '\u22A3',
                    dbkarow: '\u290F',
                    dblac: '\u02DD',
                    Dcaron: 'Ď',
                    dcaron: 'ď',
                    Dcy: 'Д',
                    dcy: 'д',
                    ddagger: '\u2021',
                    ddarr: '\u21CA',
                    DD: 'ⅅ',
                    dd: 'ⅆ',
                    DDotrahd: '\u2911',
                    ddotseq: '\u2A77',
                    deg: '\xB0',
                    Del: '\u2207',
                    Delta: 'Δ',
                    delta: 'δ',
                    demptyv: '\u29B1',
                    dfisht: '\u297F',
                    Dfr: '\uD835\uDD07',
                    dfr: '\uD835\uDD21',
                    dHar: '\u2965',
                    dharl: '\u21C3',
                    dharr: '\u21C2',
                    DiacriticalAcute: '\xB4',
                    DiacriticalDot: '\u02D9',
                    DiacriticalDoubleAcute: '\u02DD',
                    DiacriticalGrave: '`',
                    DiacriticalTilde: '\u02DC',
                    diam: '\u22C4',
                    diamond: '\u22C4',
                    Diamond: '\u22C4',
                    diamondsuit: '\u2666',
                    diams: '\u2666',
                    die: '\xA8',
                    DifferentialD: 'ⅆ',
                    digamma: 'ϝ',
                    disin: '\u22F2',
                    div: '\xF7',
                    divide: '\xF7',
                    divideontimes: '\u22C7',
                    divonx: '\u22C7',
                    DJcy: 'Ђ',
                    djcy: 'ђ',
                    dlcorn: '\u231E',
                    dlcrop: '\u230D',
                    dollar: '$',
                    Dopf: '\uD835\uDD3B',
                    dopf: '\uD835\uDD55',
                    Dot: '\xA8',
                    dot: '\u02D9',
                    DotDot: '⃜',
                    doteq: '\u2250',
                    doteqdot: '\u2251',
                    DotEqual: '\u2250',
                    dotminus: '\u2238',
                    dotplus: '\u2214',
                    dotsquare: '\u22A1',
                    doublebarwedge: '\u2306',
                    DoubleContourIntegral: '\u222F',
                    DoubleDot: '\xA8',
                    DoubleDownArrow: '\u21D3',
                    DoubleLeftArrow: '\u21D0',
                    DoubleLeftRightArrow: '\u21D4',
                    DoubleLeftTee: '\u2AE4',
                    DoubleLongLeftArrow: '\u27F8',
                    DoubleLongLeftRightArrow: '\u27FA',
                    DoubleLongRightArrow: '\u27F9',
                    DoubleRightArrow: '\u21D2',
                    DoubleRightTee: '\u22A8',
                    DoubleUpArrow: '\u21D1',
                    DoubleUpDownArrow: '\u21D5',
                    DoubleVerticalBar: '\u2225',
                    DownArrowBar: '\u2913',
                    downarrow: '\u2193',
                    DownArrow: '\u2193',
                    Downarrow: '\u21D3',
                    DownArrowUpArrow: '\u21F5',
                    DownBreve: '̑',
                    downdownarrows: '\u21CA',
                    downharpoonleft: '\u21C3',
                    downharpoonright: '\u21C2',
                    DownLeftRightVector: '\u2950',
                    DownLeftTeeVector: '\u295E',
                    DownLeftVectorBar: '\u2956',
                    DownLeftVector: '\u21BD',
                    DownRightTeeVector: '\u295F',
                    DownRightVectorBar: '\u2957',
                    DownRightVector: '\u21C1',
                    DownTeeArrow: '\u21A7',
                    DownTee: '\u22A4',
                    drbkarow: '\u2910',
                    drcorn: '\u231F',
                    drcrop: '\u230C',
                    Dscr: '\uD835\uDC9F',
                    dscr: '\uD835\uDCB9',
                    DScy: 'Ѕ',
                    dscy: 'ѕ',
                    dsol: '\u29F6',
                    Dstrok: 'Đ',
                    dstrok: 'đ',
                    dtdot: '\u22F1',
                    dtri: '\u25BF',
                    dtrif: '\u25BE',
                    duarr: '\u21F5',
                    duhar: '\u296F',
                    dwangle: '\u29A6',
                    DZcy: 'Џ',
                    dzcy: 'џ',
                    dzigrarr: '\u27FF',
                    Eacute: 'É',
                    eacute: 'é',
                    easter: '\u2A6E',
                    Ecaron: 'Ě',
                    ecaron: 'ě',
                    Ecirc: 'Ê',
                    ecirc: 'ê',
                    ecir: '\u2256',
                    ecolon: '\u2255',
                    Ecy: 'Э',
                    ecy: 'э',
                    eDDot: '\u2A77',
                    Edot: 'Ė',
                    edot: 'ė',
                    eDot: '\u2251',
                    ee: 'ⅇ',
                    efDot: '\u2252',
                    Efr: '\uD835\uDD08',
                    efr: '\uD835\uDD22',
                    eg: '\u2A9A',
                    Egrave: 'È',
                    egrave: 'è',
                    egs: '\u2A96',
                    egsdot: '\u2A98',
                    el: '\u2A99',
                    Element: '\u2208',
                    elinters: '\u23E7',
                    ell: 'ℓ',
                    els: '\u2A95',
                    elsdot: '\u2A97',
                    Emacr: 'Ē',
                    emacr: 'ē',
                    empty: '\u2205',
                    emptyset: '\u2205',
                    EmptySmallSquare: '\u25FB',
                    emptyv: '\u2205',
                    EmptyVerySmallSquare: '\u25AB',
                    emsp13: '\u2004',
                    emsp14: '\u2005',
                    emsp: '\u2003',
                    ENG: 'Ŋ',
                    eng: 'ŋ',
                    ensp: '\u2002',
                    Eogon: 'Ę',
                    eogon: 'ę',
                    Eopf: '\uD835\uDD3C',
                    eopf: '\uD835\uDD56',
                    epar: '\u22D5',
                    eparsl: '\u29E3',
                    eplus: '\u2A71',
                    epsi: 'ε',
                    Epsilon: 'Ε',
                    epsilon: 'ε',
                    epsiv: 'ϵ',
                    eqcirc: '\u2256',
                    eqcolon: '\u2255',
                    eqsim: '\u2242',
                    eqslantgtr: '\u2A96',
                    eqslantless: '\u2A95',
                    Equal: '\u2A75',
                    equals: '=',
                    EqualTilde: '\u2242',
                    equest: '\u225F',
                    Equilibrium: '\u21CC',
                    equiv: '\u2261',
                    equivDD: '\u2A78',
                    eqvparsl: '\u29E5',
                    erarr: '\u2971',
                    erDot: '\u2253',
                    escr: 'ℯ',
                    Escr: 'ℰ',
                    esdot: '\u2250',
                    Esim: '\u2A73',
                    esim: '\u2242',
                    Eta: 'Η',
                    eta: 'η',
                    ETH: 'Ð',
                    eth: 'ð',
                    Euml: 'Ë',
                    euml: 'ë',
                    euro: '\u20AC',
                    excl: '!',
                    exist: '\u2203',
                    Exists: '\u2203',
                    expectation: 'ℰ',
                    exponentiale: 'ⅇ',
                    ExponentialE: 'ⅇ',
                    fallingdotseq: '\u2252',
                    Fcy: 'Ф',
                    fcy: 'ф',
                    female: '\u2640',
                    ffilig: 'ﬃ',
                    fflig: 'ﬀ',
                    ffllig: 'ﬄ',
                    Ffr: '\uD835\uDD09',
                    ffr: '\uD835\uDD23',
                    filig: 'ﬁ',
                    FilledSmallSquare: '\u25FC',
                    FilledVerySmallSquare: '\u25AA',
                    fjlig: 'fj',
                    flat: '\u266D',
                    fllig: 'ﬂ',
                    fltns: '\u25B1',
                    fnof: 'ƒ',
                    Fopf: '\uD835\uDD3D',
                    fopf: '\uD835\uDD57',
                    forall: '\u2200',
                    ForAll: '\u2200',
                    fork: '\u22D4',
                    forkv: '\u2AD9',
                    Fouriertrf: 'ℱ',
                    fpartint: '\u2A0D',
                    frac12: '\xBD',
                    frac13: '\u2153',
                    frac14: '\xBC',
                    frac15: '\u2155',
                    frac16: '\u2159',
                    frac18: '\u215B',
                    frac23: '\u2154',
                    frac25: '\u2156',
                    frac34: '\xBE',
                    frac35: '\u2157',
                    frac38: '\u215C',
                    frac45: '\u2158',
                    frac56: '\u215A',
                    frac58: '\u215D',
                    frac78: '\u215E',
                    frasl: '\u2044',
                    frown: '\u2322',
                    fscr: '\uD835\uDCBB',
                    Fscr: 'ℱ',
                    gacute: 'ǵ',
                    Gamma: 'Γ',
                    gamma: 'γ',
                    Gammad: 'Ϝ',
                    gammad: 'ϝ',
                    gap: '\u2A86',
                    Gbreve: 'Ğ',
                    gbreve: 'ğ',
                    Gcedil: 'Ģ',
                    Gcirc: 'Ĝ',
                    gcirc: 'ĝ',
                    Gcy: 'Г',
                    gcy: 'г',
                    Gdot: 'Ġ',
                    gdot: 'ġ',
                    ge: '\u2265',
                    gE: '\u2267',
                    gEl: '\u2A8C',
                    gel: '\u22DB',
                    geq: '\u2265',
                    geqq: '\u2267',
                    geqslant: '\u2A7E',
                    gescc: '\u2AA9',
                    ges: '\u2A7E',
                    gesdot: '\u2A80',
                    gesdoto: '\u2A82',
                    gesdotol: '\u2A84',
                    gesl: '\u22DB︀',
                    gesles: '\u2A94',
                    Gfr: '\uD835\uDD0A',
                    gfr: '\uD835\uDD24',
                    gg: '\u226B',
                    Gg: '\u22D9',
                    ggg: '\u22D9',
                    gimel: 'ℷ',
                    GJcy: 'Ѓ',
                    gjcy: 'ѓ',
                    gla: '\u2AA5',
                    gl: '\u2277',
                    glE: '\u2A92',
                    glj: '\u2AA4',
                    gnap: '\u2A8A',
                    gnapprox: '\u2A8A',
                    gne: '\u2A88',
                    gnE: '\u2269',
                    gneq: '\u2A88',
                    gneqq: '\u2269',
                    gnsim: '\u22E7',
                    Gopf: '\uD835\uDD3E',
                    gopf: '\uD835\uDD58',
                    grave: '`',
                    GreaterEqual: '\u2265',
                    GreaterEqualLess: '\u22DB',
                    GreaterFullEqual: '\u2267',
                    GreaterGreater: '\u2AA2',
                    GreaterLess: '\u2277',
                    GreaterSlantEqual: '\u2A7E',
                    GreaterTilde: '\u2273',
                    Gscr: '\uD835\uDCA2',
                    gscr: 'ℊ',
                    gsim: '\u2273',
                    gsime: '\u2A8E',
                    gsiml: '\u2A90',
                    gtcc: '\u2AA7',
                    gtcir: '\u2A7A',
                    gt: '>',
                    GT: '>',
                    Gt: '\u226B',
                    gtdot: '\u22D7',
                    gtlPar: '\u2995',
                    gtquest: '\u2A7C',
                    gtrapprox: '\u2A86',
                    gtrarr: '\u2978',
                    gtrdot: '\u22D7',
                    gtreqless: '\u22DB',
                    gtreqqless: '\u2A8C',
                    gtrless: '\u2277',
                    gtrsim: '\u2273',
                    gvertneqq: '\u2269︀',
                    gvnE: '\u2269︀',
                    Hacek: 'ˇ',
                    hairsp: '\u200A',
                    half: '\xBD',
                    hamilt: 'ℋ',
                    HARDcy: 'Ъ',
                    hardcy: 'ъ',
                    harrcir: '\u2948',
                    harr: '\u2194',
                    hArr: '\u21D4',
                    harrw: '\u21AD',
                    Hat: '^',
                    hbar: 'ℏ',
                    Hcirc: 'Ĥ',
                    hcirc: 'ĥ',
                    hearts: '\u2665',
                    heartsuit: '\u2665',
                    hellip: '\u2026',
                    hercon: '\u22B9',
                    hfr: '\uD835\uDD25',
                    Hfr: 'ℌ',
                    HilbertSpace: 'ℋ',
                    hksearow: '\u2925',
                    hkswarow: '\u2926',
                    hoarr: '\u21FF',
                    homtht: '\u223B',
                    hookleftarrow: '\u21A9',
                    hookrightarrow: '\u21AA',
                    hopf: '\uD835\uDD59',
                    Hopf: 'ℍ',
                    horbar: '\u2015',
                    HorizontalLine: '\u2500',
                    hscr: '\uD835\uDCBD',
                    Hscr: 'ℋ',
                    hslash: 'ℏ',
                    Hstrok: 'Ħ',
                    hstrok: 'ħ',
                    HumpDownHump: '\u224E',
                    HumpEqual: '\u224F',
                    hybull: '\u2043',
                    hyphen: '\u2010',
                    Iacute: 'Í',
                    iacute: 'í',
                    ic: '\u2063',
                    Icirc: 'Î',
                    icirc: 'î',
                    Icy: 'И',
                    icy: 'и',
                    Idot: 'İ',
                    IEcy: 'Е',
                    iecy: 'е',
                    iexcl: '\xA1',
                    iff: '\u21D4',
                    ifr: '\uD835\uDD26',
                    Ifr: 'ℑ',
                    Igrave: 'Ì',
                    igrave: 'ì',
                    ii: 'ⅈ',
                    iiiint: '\u2A0C',
                    iiint: '\u222D',
                    iinfin: '\u29DC',
                    iiota: '\u2129',
                    IJlig: 'Ĳ',
                    ijlig: 'ĳ',
                    Imacr: 'Ī',
                    imacr: 'ī',
                    image: 'ℑ',
                    ImaginaryI: 'ⅈ',
                    imagline: 'ℐ',
                    imagpart: 'ℑ',
                    imath: 'ı',
                    Im: 'ℑ',
                    imof: '\u22B7',
                    imped: 'Ƶ',
                    Implies: '\u21D2',
                    incare: '\u2105',
                    'in': '\u2208',
                    infin: '\u221E',
                    infintie: '\u29DD',
                    inodot: 'ı',
                    intcal: '\u22BA',
                    'int': '\u222B',
                    Int: '\u222C',
                    integers: 'ℤ',
                    Integral: '\u222B',
                    intercal: '\u22BA',
                    Intersection: '\u22C2',
                    intlarhk: '\u2A17',
                    intprod: '\u2A3C',
                    InvisibleComma: '\u2063',
                    InvisibleTimes: '\u2062',
                    IOcy: 'Ё',
                    iocy: 'ё',
                    Iogon: 'Į',
                    iogon: 'į',
                    Iopf: '\uD835\uDD40',
                    iopf: '\uD835\uDD5A',
                    Iota: 'Ι',
                    iota: 'ι',
                    iprod: '\u2A3C',
                    iquest: '\xBF',
                    iscr: '\uD835\uDCBE',
                    Iscr: 'ℐ',
                    isin: '\u2208',
                    isindot: '\u22F5',
                    isinE: '\u22F9',
                    isins: '\u22F4',
                    isinsv: '\u22F3',
                    isinv: '\u2208',
                    it: '\u2062',
                    Itilde: 'Ĩ',
                    itilde: 'ĩ',
                    Iukcy: 'І',
                    iukcy: 'і',
                    Iuml: 'Ï',
                    iuml: 'ï',
                    Jcirc: 'Ĵ',
                    jcirc: 'ĵ',
                    Jcy: 'Й',
                    jcy: 'й',
                    Jfr: '\uD835\uDD0D',
                    jfr: '\uD835\uDD27',
                    jmath: 'ȷ',
                    Jopf: '\uD835\uDD41',
                    jopf: '\uD835\uDD5B',
                    Jscr: '\uD835\uDCA5',
                    jscr: '\uD835\uDCBF',
                    Jsercy: 'Ј',
                    jsercy: 'ј',
                    Jukcy: 'Є',
                    jukcy: 'є',
                    Kappa: 'Κ',
                    kappa: 'κ',
                    kappav: 'ϰ',
                    Kcedil: 'Ķ',
                    kcedil: 'ķ',
                    Kcy: 'К',
                    kcy: 'к',
                    Kfr: '\uD835\uDD0E',
                    kfr: '\uD835\uDD28',
                    kgreen: 'ĸ',
                    KHcy: 'Х',
                    khcy: 'х',
                    KJcy: 'Ќ',
                    kjcy: 'ќ',
                    Kopf: '\uD835\uDD42',
                    kopf: '\uD835\uDD5C',
                    Kscr: '\uD835\uDCA6',
                    kscr: '\uD835\uDCC0',
                    lAarr: '\u21DA',
                    Lacute: 'Ĺ',
                    lacute: 'ĺ',
                    laemptyv: '\u29B4',
                    lagran: 'ℒ',
                    Lambda: 'Λ',
                    lambda: 'λ',
                    lang: '\u27E8',
                    Lang: '\u27EA',
                    langd: '\u2991',
                    langle: '\u27E8',
                    lap: '\u2A85',
                    Laplacetrf: 'ℒ',
                    laquo: '\xAB',
                    larrb: '\u21E4',
                    larrbfs: '\u291F',
                    larr: '\u2190',
                    Larr: '\u219E',
                    lArr: '\u21D0',
                    larrfs: '\u291D',
                    larrhk: '\u21A9',
                    larrlp: '\u21AB',
                    larrpl: '\u2939',
                    larrsim: '\u2973',
                    larrtl: '\u21A2',
                    latail: '\u2919',
                    lAtail: '\u291B',
                    lat: '\u2AAB',
                    late: '\u2AAD',
                    lates: '\u2AAD︀',
                    lbarr: '\u290C',
                    lBarr: '\u290E',
                    lbbrk: '\u2772',
                    lbrace: '{',
                    lbrack: '[',
                    lbrke: '\u298B',
                    lbrksld: '\u298F',
                    lbrkslu: '\u298D',
                    Lcaron: 'Ľ',
                    lcaron: 'ľ',
                    Lcedil: 'Ļ',
                    lcedil: 'ļ',
                    lceil: '\u2308',
                    lcub: '{',
                    Lcy: 'Л',
                    lcy: 'л',
                    ldca: '\u2936',
                    ldquo: '\u201C',
                    ldquor: '\u201E',
                    ldrdhar: '\u2967',
                    ldrushar: '\u294B',
                    ldsh: '\u21B2',
                    le: '\u2264',
                    lE: '\u2266',
                    LeftAngleBracket: '\u27E8',
                    LeftArrowBar: '\u21E4',
                    leftarrow: '\u2190',
                    LeftArrow: '\u2190',
                    Leftarrow: '\u21D0',
                    LeftArrowRightArrow: '\u21C6',
                    leftarrowtail: '\u21A2',
                    LeftCeiling: '\u2308',
                    LeftDoubleBracket: '\u27E6',
                    LeftDownTeeVector: '\u2961',
                    LeftDownVectorBar: '\u2959',
                    LeftDownVector: '\u21C3',
                    LeftFloor: '\u230A',
                    leftharpoondown: '\u21BD',
                    leftharpoonup: '\u21BC',
                    leftleftarrows: '\u21C7',
                    leftrightarrow: '\u2194',
                    LeftRightArrow: '\u2194',
                    Leftrightarrow: '\u21D4',
                    leftrightarrows: '\u21C6',
                    leftrightharpoons: '\u21CB',
                    leftrightsquigarrow: '\u21AD',
                    LeftRightVector: '\u294E',
                    LeftTeeArrow: '\u21A4',
                    LeftTee: '\u22A3',
                    LeftTeeVector: '\u295A',
                    leftthreetimes: '\u22CB',
                    LeftTriangleBar: '\u29CF',
                    LeftTriangle: '\u22B2',
                    LeftTriangleEqual: '\u22B4',
                    LeftUpDownVector: '\u2951',
                    LeftUpTeeVector: '\u2960',
                    LeftUpVectorBar: '\u2958',
                    LeftUpVector: '\u21BF',
                    LeftVectorBar: '\u2952',
                    LeftVector: '\u21BC',
                    lEg: '\u2A8B',
                    leg: '\u22DA',
                    leq: '\u2264',
                    leqq: '\u2266',
                    leqslant: '\u2A7D',
                    lescc: '\u2AA8',
                    les: '\u2A7D',
                    lesdot: '\u2A7F',
                    lesdoto: '\u2A81',
                    lesdotor: '\u2A83',
                    lesg: '\u22DA︀',
                    lesges: '\u2A93',
                    lessapprox: '\u2A85',
                    lessdot: '\u22D6',
                    lesseqgtr: '\u22DA',
                    lesseqqgtr: '\u2A8B',
                    LessEqualGreater: '\u22DA',
                    LessFullEqual: '\u2266',
                    LessGreater: '\u2276',
                    lessgtr: '\u2276',
                    LessLess: '\u2AA1',
                    lesssim: '\u2272',
                    LessSlantEqual: '\u2A7D',
                    LessTilde: '\u2272',
                    lfisht: '\u297C',
                    lfloor: '\u230A',
                    Lfr: '\uD835\uDD0F',
                    lfr: '\uD835\uDD29',
                    lg: '\u2276',
                    lgE: '\u2A91',
                    lHar: '\u2962',
                    lhard: '\u21BD',
                    lharu: '\u21BC',
                    lharul: '\u296A',
                    lhblk: '\u2584',
                    LJcy: 'Љ',
                    ljcy: 'љ',
                    llarr: '\u21C7',
                    ll: '\u226A',
                    Ll: '\u22D8',
                    llcorner: '\u231E',
                    Lleftarrow: '\u21DA',
                    llhard: '\u296B',
                    lltri: '\u25FA',
                    Lmidot: 'Ŀ',
                    lmidot: 'ŀ',
                    lmoustache: '\u23B0',
                    lmoust: '\u23B0',
                    lnap: '\u2A89',
                    lnapprox: '\u2A89',
                    lne: '\u2A87',
                    lnE: '\u2268',
                    lneq: '\u2A87',
                    lneqq: '\u2268',
                    lnsim: '\u22E6',
                    loang: '\u27EC',
                    loarr: '\u21FD',
                    lobrk: '\u27E6',
                    longleftarrow: '\u27F5',
                    LongLeftArrow: '\u27F5',
                    Longleftarrow: '\u27F8',
                    longleftrightarrow: '\u27F7',
                    LongLeftRightArrow: '\u27F7',
                    Longleftrightarrow: '\u27FA',
                    longmapsto: '\u27FC',
                    longrightarrow: '\u27F6',
                    LongRightArrow: '\u27F6',
                    Longrightarrow: '\u27F9',
                    looparrowleft: '\u21AB',
                    looparrowright: '\u21AC',
                    lopar: '\u2985',
                    Lopf: '\uD835\uDD43',
                    lopf: '\uD835\uDD5D',
                    loplus: '\u2A2D',
                    lotimes: '\u2A34',
                    lowast: '\u2217',
                    lowbar: '_',
                    LowerLeftArrow: '\u2199',
                    LowerRightArrow: '\u2198',
                    loz: '\u25CA',
                    lozenge: '\u25CA',
                    lozf: '\u29EB',
                    lpar: '(',
                    lparlt: '\u2993',
                    lrarr: '\u21C6',
                    lrcorner: '\u231F',
                    lrhar: '\u21CB',
                    lrhard: '\u296D',
                    lrm: '\u200E',
                    lrtri: '\u22BF',
                    lsaquo: '\u2039',
                    lscr: '\uD835\uDCC1',
                    Lscr: 'ℒ',
                    lsh: '\u21B0',
                    Lsh: '\u21B0',
                    lsim: '\u2272',
                    lsime: '\u2A8D',
                    lsimg: '\u2A8F',
                    lsqb: '[',
                    lsquo: '\u2018',
                    lsquor: '\u201A',
                    Lstrok: 'Ł',
                    lstrok: 'ł',
                    ltcc: '\u2AA6',
                    ltcir: '\u2A79',
                    lt: '<',
                    LT: '<',
                    Lt: '\u226A',
                    ltdot: '\u22D6',
                    lthree: '\u22CB',
                    ltimes: '\u22C9',
                    ltlarr: '\u2976',
                    ltquest: '\u2A7B',
                    ltri: '\u25C3',
                    ltrie: '\u22B4',
                    ltrif: '\u25C2',
                    ltrPar: '\u2996',
                    lurdshar: '\u294A',
                    luruhar: '\u2966',
                    lvertneqq: '\u2268︀',
                    lvnE: '\u2268︀',
                    macr: '\xAF',
                    male: '\u2642',
                    malt: '\u2720',
                    maltese: '\u2720',
                    Map: '\u2905',
                    map: '\u21A6',
                    mapsto: '\u21A6',
                    mapstodown: '\u21A7',
                    mapstoleft: '\u21A4',
                    mapstoup: '\u21A5',
                    marker: '\u25AE',
                    mcomma: '\u2A29',
                    Mcy: 'М',
                    mcy: 'м',
                    mdash: '\u2014',
                    mDDot: '\u223A',
                    measuredangle: '\u2221',
                    MediumSpace: '\u205F',
                    Mellintrf: 'ℳ',
                    Mfr: '\uD835\uDD10',
                    mfr: '\uD835\uDD2A',
                    mho: '\u2127',
                    micro: 'µ',
                    midast: '*',
                    midcir: '\u2AF0',
                    mid: '\u2223',
                    middot: '\xB7',
                    minusb: '\u229F',
                    minus: '\u2212',
                    minusd: '\u2238',
                    minusdu: '\u2A2A',
                    MinusPlus: '\u2213',
                    mlcp: '\u2ADB',
                    mldr: '\u2026',
                    mnplus: '\u2213',
                    models: '\u22A7',
                    Mopf: '\uD835\uDD44',
                    mopf: '\uD835\uDD5E',
                    mp: '\u2213',
                    mscr: '\uD835\uDCC2',
                    Mscr: 'ℳ',
                    mstpos: '\u223E',
                    Mu: 'Μ',
                    mu: 'μ',
                    multimap: '\u22B8',
                    mumap: '\u22B8',
                    nabla: '\u2207',
                    Nacute: 'Ń',
                    nacute: 'ń',
                    nang: '\u2220⃒',
                    nap: '\u2249',
                    napE: '\u2A70̸',
                    napid: '\u224B̸',
                    napos: 'ŉ',
                    napprox: '\u2249',
                    natural: '\u266E',
                    naturals: 'ℕ',
                    natur: '\u266E',
                    nbsp: '\xA0',
                    nbump: '\u224E̸',
                    nbumpe: '\u224F̸',
                    ncap: '\u2A43',
                    Ncaron: 'Ň',
                    ncaron: 'ň',
                    Ncedil: 'Ņ',
                    ncedil: 'ņ',
                    ncong: '\u2247',
                    ncongdot: '\u2A6D̸',
                    ncup: '\u2A42',
                    Ncy: 'Н',
                    ncy: 'н',
                    ndash: '\u2013',
                    nearhk: '\u2924',
                    nearr: '\u2197',
                    neArr: '\u21D7',
                    nearrow: '\u2197',
                    ne: '\u2260',
                    nedot: '\u2250̸',
                    NegativeMediumSpace: '\u200B',
                    NegativeThickSpace: '\u200B',
                    NegativeThinSpace: '\u200B',
                    NegativeVeryThinSpace: '\u200B',
                    nequiv: '\u2262',
                    nesear: '\u2928',
                    nesim: '\u2242̸',
                    NestedGreaterGreater: '\u226B',
                    NestedLessLess: '\u226A',
                    NewLine: '\n',
                    nexist: '\u2204',
                    nexists: '\u2204',
                    Nfr: '\uD835\uDD11',
                    nfr: '\uD835\uDD2B',
                    ngE: '\u2267̸',
                    nge: '\u2271',
                    ngeq: '\u2271',
                    ngeqq: '\u2267̸',
                    ngeqslant: '\u2A7E̸',
                    nges: '\u2A7E̸',
                    nGg: '\u22D9̸',
                    ngsim: '\u2275',
                    nGt: '\u226B⃒',
                    ngt: '\u226F',
                    ngtr: '\u226F',
                    nGtv: '\u226B̸',
                    nharr: '\u21AE',
                    nhArr: '\u21CE',
                    nhpar: '\u2AF2',
                    ni: '\u220B',
                    nis: '\u22FC',
                    nisd: '\u22FA',
                    niv: '\u220B',
                    NJcy: 'Њ',
                    njcy: 'њ',
                    nlarr: '\u219A',
                    nlArr: '\u21CD',
                    nldr: '\u2025',
                    nlE: '\u2266̸',
                    nle: '\u2270',
                    nleftarrow: '\u219A',
                    nLeftarrow: '\u21CD',
                    nleftrightarrow: '\u21AE',
                    nLeftrightarrow: '\u21CE',
                    nleq: '\u2270',
                    nleqq: '\u2266̸',
                    nleqslant: '\u2A7D̸',
                    nles: '\u2A7D̸',
                    nless: '\u226E',
                    nLl: '\u22D8̸',
                    nlsim: '\u2274',
                    nLt: '\u226A⃒',
                    nlt: '\u226E',
                    nltri: '\u22EA',
                    nltrie: '\u22EC',
                    nLtv: '\u226A̸',
                    nmid: '\u2224',
                    NoBreak: '\u2060',
                    NonBreakingSpace: '\xA0',
                    nopf: '\uD835\uDD5F',
                    Nopf: 'ℕ',
                    Not: '\u2AEC',
                    not: '\xAC',
                    NotCongruent: '\u2262',
                    NotCupCap: '\u226D',
                    NotDoubleVerticalBar: '\u2226',
                    NotElement: '\u2209',
                    NotEqual: '\u2260',
                    NotEqualTilde: '\u2242̸',
                    NotExists: '\u2204',
                    NotGreater: '\u226F',
                    NotGreaterEqual: '\u2271',
                    NotGreaterFullEqual: '\u2267̸',
                    NotGreaterGreater: '\u226B̸',
                    NotGreaterLess: '\u2279',
                    NotGreaterSlantEqual: '\u2A7E̸',
                    NotGreaterTilde: '\u2275',
                    NotHumpDownHump: '\u224E̸',
                    NotHumpEqual: '\u224F̸',
                    notin: '\u2209',
                    notindot: '\u22F5̸',
                    notinE: '\u22F9̸',
                    notinva: '\u2209',
                    notinvb: '\u22F7',
                    notinvc: '\u22F6',
                    NotLeftTriangleBar: '\u29CF̸',
                    NotLeftTriangle: '\u22EA',
                    NotLeftTriangleEqual: '\u22EC',
                    NotLess: '\u226E',
                    NotLessEqual: '\u2270',
                    NotLessGreater: '\u2278',
                    NotLessLess: '\u226A̸',
                    NotLessSlantEqual: '\u2A7D̸',
                    NotLessTilde: '\u2274',
                    NotNestedGreaterGreater: '\u2AA2̸',
                    NotNestedLessLess: '\u2AA1̸',
                    notni: '\u220C',
                    notniva: '\u220C',
                    notnivb: '\u22FE',
                    notnivc: '\u22FD',
                    NotPrecedes: '\u2280',
                    NotPrecedesEqual: '\u2AAF̸',
                    NotPrecedesSlantEqual: '\u22E0',
                    NotReverseElement: '\u220C',
                    NotRightTriangleBar: '\u29D0̸',
                    NotRightTriangle: '\u22EB',
                    NotRightTriangleEqual: '\u22ED',
                    NotSquareSubset: '\u228F̸',
                    NotSquareSubsetEqual: '\u22E2',
                    NotSquareSuperset: '\u2290̸',
                    NotSquareSupersetEqual: '\u22E3',
                    NotSubset: '\u2282⃒',
                    NotSubsetEqual: '\u2288',
                    NotSucceeds: '\u2281',
                    NotSucceedsEqual: '\u2AB0̸',
                    NotSucceedsSlantEqual: '\u22E1',
                    NotSucceedsTilde: '\u227F̸',
                    NotSuperset: '\u2283⃒',
                    NotSupersetEqual: '\u2289',
                    NotTilde: '\u2241',
                    NotTildeEqual: '\u2244',
                    NotTildeFullEqual: '\u2247',
                    NotTildeTilde: '\u2249',
                    NotVerticalBar: '\u2224',
                    nparallel: '\u2226',
                    npar: '\u2226',
                    nparsl: '\u2AFD⃥',
                    npart: '\u2202̸',
                    npolint: '\u2A14',
                    npr: '\u2280',
                    nprcue: '\u22E0',
                    nprec: '\u2280',
                    npreceq: '\u2AAF̸',
                    npre: '\u2AAF̸',
                    nrarrc: '\u2933̸',
                    nrarr: '\u219B',
                    nrArr: '\u21CF',
                    nrarrw: '\u219D̸',
                    nrightarrow: '\u219B',
                    nRightarrow: '\u21CF',
                    nrtri: '\u22EB',
                    nrtrie: '\u22ED',
                    nsc: '\u2281',
                    nsccue: '\u22E1',
                    nsce: '\u2AB0̸',
                    Nscr: '\uD835\uDCA9',
                    nscr: '\uD835\uDCC3',
                    nshortmid: '\u2224',
                    nshortparallel: '\u2226',
                    nsim: '\u2241',
                    nsime: '\u2244',
                    nsimeq: '\u2244',
                    nsmid: '\u2224',
                    nspar: '\u2226',
                    nsqsube: '\u22E2',
                    nsqsupe: '\u22E3',
                    nsub: '\u2284',
                    nsubE: '\u2AC5̸',
                    nsube: '\u2288',
                    nsubset: '\u2282⃒',
                    nsubseteq: '\u2288',
                    nsubseteqq: '\u2AC5̸',
                    nsucc: '\u2281',
                    nsucceq: '\u2AB0̸',
                    nsup: '\u2285',
                    nsupE: '\u2AC6̸',
                    nsupe: '\u2289',
                    nsupset: '\u2283⃒',
                    nsupseteq: '\u2289',
                    nsupseteqq: '\u2AC6̸',
                    ntgl: '\u2279',
                    Ntilde: 'Ñ',
                    ntilde: 'ñ',
                    ntlg: '\u2278',
                    ntriangleleft: '\u22EA',
                    ntrianglelefteq: '\u22EC',
                    ntriangleright: '\u22EB',
                    ntrianglerighteq: '\u22ED',
                    Nu: 'Ν',
                    nu: 'ν',
                    num: '#',
                    numero: '\u2116',
                    numsp: '\u2007',
                    nvap: '\u224D⃒',
                    nvdash: '\u22AC',
                    nvDash: '\u22AD',
                    nVdash: '\u22AE',
                    nVDash: '\u22AF',
                    nvge: '\u2265⃒',
                    nvgt: '>⃒',
                    nvHarr: '\u2904',
                    nvinfin: '\u29DE',
                    nvlArr: '\u2902',
                    nvle: '\u2264⃒',
                    nvlt: '<⃒',
                    nvltrie: '\u22B4⃒',
                    nvrArr: '\u2903',
                    nvrtrie: '\u22B5⃒',
                    nvsim: '\u223C⃒',
                    nwarhk: '\u2923',
                    nwarr: '\u2196',
                    nwArr: '\u21D6',
                    nwarrow: '\u2196',
                    nwnear: '\u2927',
                    Oacute: 'Ó',
                    oacute: 'ó',
                    oast: '\u229B',
                    Ocirc: 'Ô',
                    ocirc: 'ô',
                    ocir: '\u229A',
                    Ocy: 'О',
                    ocy: 'о',
                    odash: '\u229D',
                    Odblac: 'Ő',
                    odblac: 'ő',
                    odiv: '\u2A38',
                    odot: '\u2299',
                    odsold: '\u29BC',
                    OElig: 'Œ',
                    oelig: 'œ',
                    ofcir: '\u29BF',
                    Ofr: '\uD835\uDD12',
                    ofr: '\uD835\uDD2C',
                    ogon: '\u02DB',
                    Ograve: 'Ò',
                    ograve: 'ò',
                    ogt: '\u29C1',
                    ohbar: '\u29B5',
                    ohm: 'Ω',
                    oint: '\u222E',
                    olarr: '\u21BA',
                    olcir: '\u29BE',
                    olcross: '\u29BB',
                    oline: '\u203E',
                    olt: '\u29C0',
                    Omacr: 'Ō',
                    omacr: 'ō',
                    Omega: 'Ω',
                    omega: 'ω',
                    Omicron: 'Ο',
                    omicron: 'ο',
                    omid: '\u29B6',
                    ominus: '\u2296',
                    Oopf: '\uD835\uDD46',
                    oopf: '\uD835\uDD60',
                    opar: '\u29B7',
                    OpenCurlyDoubleQuote: '\u201C',
                    OpenCurlyQuote: '\u2018',
                    operp: '\u29B9',
                    oplus: '\u2295',
                    orarr: '\u21BB',
                    Or: '\u2A54',
                    or: '\u2228',
                    ord: '\u2A5D',
                    order: 'ℴ',
                    orderof: 'ℴ',
                    ordf: 'ª',
                    ordm: 'º',
                    origof: '\u22B6',
                    oror: '\u2A56',
                    orslope: '\u2A57',
                    orv: '\u2A5B',
                    oS: '\u24C8',
                    Oscr: '\uD835\uDCAA',
                    oscr: 'ℴ',
                    Oslash: 'Ø',
                    oslash: 'ø',
                    osol: '\u2298',
                    Otilde: 'Õ',
                    otilde: 'õ',
                    otimesas: '\u2A36',
                    Otimes: '\u2A37',
                    otimes: '\u2297',
                    Ouml: 'Ö',
                    ouml: 'ö',
                    ovbar: '\u233D',
                    OverBar: '\u203E',
                    OverBrace: '\u23DE',
                    OverBracket: '\u23B4',
                    OverParenthesis: '\u23DC',
                    para: '\xB6',
                    parallel: '\u2225',
                    par: '\u2225',
                    parsim: '\u2AF3',
                    parsl: '\u2AFD',
                    part: '\u2202',
                    PartialD: '\u2202',
                    Pcy: 'П',
                    pcy: 'п',
                    percnt: '%',
                    period: '.',
                    permil: '\u2030',
                    perp: '\u22A5',
                    pertenk: '\u2031',
                    Pfr: '\uD835\uDD13',
                    pfr: '\uD835\uDD2D',
                    Phi: 'Φ',
                    phi: 'φ',
                    phiv: 'ϕ',
                    phmmat: 'ℳ',
                    phone: '\u260E',
                    Pi: 'Π',
                    pi: 'π',
                    pitchfork: '\u22D4',
                    piv: 'ϖ',
                    planck: 'ℏ',
                    planckh: 'ℎ',
                    plankv: 'ℏ',
                    plusacir: '\u2A23',
                    plusb: '\u229E',
                    pluscir: '\u2A22',
                    plus: '+',
                    plusdo: '\u2214',
                    plusdu: '\u2A25',
                    pluse: '\u2A72',
                    PlusMinus: '\xB1',
                    plusmn: '\xB1',
                    plussim: '\u2A26',
                    plustwo: '\u2A27',
                    pm: '\xB1',
                    Poincareplane: 'ℌ',
                    pointint: '\u2A15',
                    popf: '\uD835\uDD61',
                    Popf: 'ℙ',
                    pound: '\xA3',
                    prap: '\u2AB7',
                    Pr: '\u2ABB',
                    pr: '\u227A',
                    prcue: '\u227C',
                    precapprox: '\u2AB7',
                    prec: '\u227A',
                    preccurlyeq: '\u227C',
                    Precedes: '\u227A',
                    PrecedesEqual: '\u2AAF',
                    PrecedesSlantEqual: '\u227C',
                    PrecedesTilde: '\u227E',
                    preceq: '\u2AAF',
                    precnapprox: '\u2AB9',
                    precneqq: '\u2AB5',
                    precnsim: '\u22E8',
                    pre: '\u2AAF',
                    prE: '\u2AB3',
                    precsim: '\u227E',
                    prime: '\u2032',
                    Prime: '\u2033',
                    primes: 'ℙ',
                    prnap: '\u2AB9',
                    prnE: '\u2AB5',
                    prnsim: '\u22E8',
                    prod: '\u220F',
                    Product: '\u220F',
                    profalar: '\u232E',
                    profline: '\u2312',
                    profsurf: '\u2313',
                    prop: '\u221D',
                    Proportional: '\u221D',
                    Proportion: '\u2237',
                    propto: '\u221D',
                    prsim: '\u227E',
                    prurel: '\u22B0',
                    Pscr: '\uD835\uDCAB',
                    pscr: '\uD835\uDCC5',
                    Psi: 'Ψ',
                    psi: 'ψ',
                    puncsp: '\u2008',
                    Qfr: '\uD835\uDD14',
                    qfr: '\uD835\uDD2E',
                    qint: '\u2A0C',
                    qopf: '\uD835\uDD62',
                    Qopf: 'ℚ',
                    qprime: '\u2057',
                    Qscr: '\uD835\uDCAC',
                    qscr: '\uD835\uDCC6',
                    quaternions: 'ℍ',
                    quatint: '\u2A16',
                    quest: '?',
                    questeq: '\u225F',
                    quot: '"',
                    QUOT: '"',
                    rAarr: '\u21DB',
                    race: '\u223Ḏ',
                    Racute: 'Ŕ',
                    racute: 'ŕ',
                    radic: '\u221A',
                    raemptyv: '\u29B3',
                    rang: '\u27E9',
                    Rang: '\u27EB',
                    rangd: '\u2992',
                    range: '\u29A5',
                    rangle: '\u27E9',
                    raquo: '\xBB',
                    rarrap: '\u2975',
                    rarrb: '\u21E5',
                    rarrbfs: '\u2920',
                    rarrc: '\u2933',
                    rarr: '\u2192',
                    Rarr: '\u21A0',
                    rArr: '\u21D2',
                    rarrfs: '\u291E',
                    rarrhk: '\u21AA',
                    rarrlp: '\u21AC',
                    rarrpl: '\u2945',
                    rarrsim: '\u2974',
                    Rarrtl: '\u2916',
                    rarrtl: '\u21A3',
                    rarrw: '\u219D',
                    ratail: '\u291A',
                    rAtail: '\u291C',
                    ratio: '\u2236',
                    rationals: 'ℚ',
                    rbarr: '\u290D',
                    rBarr: '\u290F',
                    RBarr: '\u2910',
                    rbbrk: '\u2773',
                    rbrace: '}',
                    rbrack: ']',
                    rbrke: '\u298C',
                    rbrksld: '\u298E',
                    rbrkslu: '\u2990',
                    Rcaron: 'Ř',
                    rcaron: 'ř',
                    Rcedil: 'Ŗ',
                    rcedil: 'ŗ',
                    rceil: '\u2309',
                    rcub: '}',
                    Rcy: 'Р',
                    rcy: 'р',
                    rdca: '\u2937',
                    rdldhar: '\u2969',
                    rdquo: '\u201D',
                    rdquor: '\u201D',
                    rdsh: '\u21B3',
                    real: 'ℜ',
                    realine: 'ℛ',
                    realpart: 'ℜ',
                    reals: 'ℝ',
                    Re: 'ℜ',
                    rect: '\u25AD',
                    reg: '\xAE',
                    REG: '\xAE',
                    ReverseElement: '\u220B',
                    ReverseEquilibrium: '\u21CB',
                    ReverseUpEquilibrium: '\u296F',
                    rfisht: '\u297D',
                    rfloor: '\u230B',
                    rfr: '\uD835\uDD2F',
                    Rfr: 'ℜ',
                    rHar: '\u2964',
                    rhard: '\u21C1',
                    rharu: '\u21C0',
                    rharul: '\u296C',
                    Rho: 'Ρ',
                    rho: 'ρ',
                    rhov: 'ϱ',
                    RightAngleBracket: '\u27E9',
                    RightArrowBar: '\u21E5',
                    rightarrow: '\u2192',
                    RightArrow: '\u2192',
                    Rightarrow: '\u21D2',
                    RightArrowLeftArrow: '\u21C4',
                    rightarrowtail: '\u21A3',
                    RightCeiling: '\u2309',
                    RightDoubleBracket: '\u27E7',
                    RightDownTeeVector: '\u295D',
                    RightDownVectorBar: '\u2955',
                    RightDownVector: '\u21C2',
                    RightFloor: '\u230B',
                    rightharpoondown: '\u21C1',
                    rightharpoonup: '\u21C0',
                    rightleftarrows: '\u21C4',
                    rightleftharpoons: '\u21CC',
                    rightrightarrows: '\u21C9',
                    rightsquigarrow: '\u219D',
                    RightTeeArrow: '\u21A6',
                    RightTee: '\u22A2',
                    RightTeeVector: '\u295B',
                    rightthreetimes: '\u22CC',
                    RightTriangleBar: '\u29D0',
                    RightTriangle: '\u22B3',
                    RightTriangleEqual: '\u22B5',
                    RightUpDownVector: '\u294F',
                    RightUpTeeVector: '\u295C',
                    RightUpVectorBar: '\u2954',
                    RightUpVector: '\u21BE',
                    RightVectorBar: '\u2953',
                    RightVector: '\u21C0',
                    ring: '\u02DA',
                    risingdotseq: '\u2253',
                    rlarr: '\u21C4',
                    rlhar: '\u21CC',
                    rlm: '\u200F',
                    rmoustache: '\u23B1',
                    rmoust: '\u23B1',
                    rnmid: '\u2AEE',
                    roang: '\u27ED',
                    roarr: '\u21FE',
                    robrk: '\u27E7',
                    ropar: '\u2986',
                    ropf: '\uD835\uDD63',
                    Ropf: 'ℝ',
                    roplus: '\u2A2E',
                    rotimes: '\u2A35',
                    RoundImplies: '\u2970',
                    rpar: ')',
                    rpargt: '\u2994',
                    rppolint: '\u2A12',
                    rrarr: '\u21C9',
                    Rrightarrow: '\u21DB',
                    rsaquo: '\u203A',
                    rscr: '\uD835\uDCC7',
                    Rscr: 'ℛ',
                    rsh: '\u21B1',
                    Rsh: '\u21B1',
                    rsqb: ']',
                    rsquo: '\u2019',
                    rsquor: '\u2019',
                    rthree: '\u22CC',
                    rtimes: '\u22CA',
                    rtri: '\u25B9',
                    rtrie: '\u22B5',
                    rtrif: '\u25B8',
                    rtriltri: '\u29CE',
                    RuleDelayed: '\u29F4',
                    ruluhar: '\u2968',
                    rx: '\u211E',
                    Sacute: 'Ś',
                    sacute: 'ś',
                    sbquo: '\u201A',
                    scap: '\u2AB8',
                    Scaron: 'Š',
                    scaron: 'š',
                    Sc: '\u2ABC',
                    sc: '\u227B',
                    sccue: '\u227D',
                    sce: '\u2AB0',
                    scE: '\u2AB4',
                    Scedil: 'Ş',
                    scedil: 'ş',
                    Scirc: 'Ŝ',
                    scirc: 'ŝ',
                    scnap: '\u2ABA',
                    scnE: '\u2AB6',
                    scnsim: '\u22E9',
                    scpolint: '\u2A13',
                    scsim: '\u227F',
                    Scy: 'С',
                    scy: 'с',
                    sdotb: '\u22A1',
                    sdot: '\u22C5',
                    sdote: '\u2A66',
                    searhk: '\u2925',
                    searr: '\u2198',
                    seArr: '\u21D8',
                    searrow: '\u2198',
                    sect: '\xA7',
                    semi: ';',
                    seswar: '\u2929',
                    setminus: '\u2216',
                    setmn: '\u2216',
                    sext: '\u2736',
                    Sfr: '\uD835\uDD16',
                    sfr: '\uD835\uDD30',
                    sfrown: '\u2322',
                    sharp: '\u266F',
                    SHCHcy: 'Щ',
                    shchcy: 'щ',
                    SHcy: 'Ш',
                    shcy: 'ш',
                    ShortDownArrow: '\u2193',
                    ShortLeftArrow: '\u2190',
                    shortmid: '\u2223',
                    shortparallel: '\u2225',
                    ShortRightArrow: '\u2192',
                    ShortUpArrow: '\u2191',
                    shy: '\xAD',
                    Sigma: 'Σ',
                    sigma: 'σ',
                    sigmaf: 'ς',
                    sigmav: 'ς',
                    sim: '\u223C',
                    simdot: '\u2A6A',
                    sime: '\u2243',
                    simeq: '\u2243',
                    simg: '\u2A9E',
                    simgE: '\u2AA0',
                    siml: '\u2A9D',
                    simlE: '\u2A9F',
                    simne: '\u2246',
                    simplus: '\u2A24',
                    simrarr: '\u2972',
                    slarr: '\u2190',
                    SmallCircle: '\u2218',
                    smallsetminus: '\u2216',
                    smashp: '\u2A33',
                    smeparsl: '\u29E4',
                    smid: '\u2223',
                    smile: '\u2323',
                    smt: '\u2AAA',
                    smte: '\u2AAC',
                    smtes: '\u2AAC︀',
                    SOFTcy: 'Ь',
                    softcy: 'ь',
                    solbar: '\u233F',
                    solb: '\u29C4',
                    sol: '/',
                    Sopf: '\uD835\uDD4A',
                    sopf: '\uD835\uDD64',
                    spades: '\u2660',
                    spadesuit: '\u2660',
                    spar: '\u2225',
                    sqcap: '\u2293',
                    sqcaps: '\u2293︀',
                    sqcup: '\u2294',
                    sqcups: '\u2294︀',
                    Sqrt: '\u221A',
                    sqsub: '\u228F',
                    sqsube: '\u2291',
                    sqsubset: '\u228F',
                    sqsubseteq: '\u2291',
                    sqsup: '\u2290',
                    sqsupe: '\u2292',
                    sqsupset: '\u2290',
                    sqsupseteq: '\u2292',
                    square: '\u25A1',
                    Square: '\u25A1',
                    SquareIntersection: '\u2293',
                    SquareSubset: '\u228F',
                    SquareSubsetEqual: '\u2291',
                    SquareSuperset: '\u2290',
                    SquareSupersetEqual: '\u2292',
                    SquareUnion: '\u2294',
                    squarf: '\u25AA',
                    squ: '\u25A1',
                    squf: '\u25AA',
                    srarr: '\u2192',
                    Sscr: '\uD835\uDCAE',
                    sscr: '\uD835\uDCC8',
                    ssetmn: '\u2216',
                    ssmile: '\u2323',
                    sstarf: '\u22C6',
                    Star: '\u22C6',
                    star: '\u2606',
                    starf: '\u2605',
                    straightepsilon: 'ϵ',
                    straightphi: 'ϕ',
                    strns: '\xAF',
                    sub: '\u2282',
                    Sub: '\u22D0',
                    subdot: '\u2ABD',
                    subE: '\u2AC5',
                    sube: '\u2286',
                    subedot: '\u2AC3',
                    submult: '\u2AC1',
                    subnE: '\u2ACB',
                    subne: '\u228A',
                    subplus: '\u2ABF',
                    subrarr: '\u2979',
                    subset: '\u2282',
                    Subset: '\u22D0',
                    subseteq: '\u2286',
                    subseteqq: '\u2AC5',
                    SubsetEqual: '\u2286',
                    subsetneq: '\u228A',
                    subsetneqq: '\u2ACB',
                    subsim: '\u2AC7',
                    subsub: '\u2AD5',
                    subsup: '\u2AD3',
                    succapprox: '\u2AB8',
                    succ: '\u227B',
                    succcurlyeq: '\u227D',
                    Succeeds: '\u227B',
                    SucceedsEqual: '\u2AB0',
                    SucceedsSlantEqual: '\u227D',
                    SucceedsTilde: '\u227F',
                    succeq: '\u2AB0',
                    succnapprox: '\u2ABA',
                    succneqq: '\u2AB6',
                    succnsim: '\u22E9',
                    succsim: '\u227F',
                    SuchThat: '\u220B',
                    sum: '\u2211',
                    Sum: '\u2211',
                    sung: '\u266A',
                    sup1: '\xB9',
                    sup2: '\xB2',
                    sup3: '\xB3',
                    sup: '\u2283',
                    Sup: '\u22D1',
                    supdot: '\u2ABE',
                    supdsub: '\u2AD8',
                    supE: '\u2AC6',
                    supe: '\u2287',
                    supedot: '\u2AC4',
                    Superset: '\u2283',
                    SupersetEqual: '\u2287',
                    suphsol: '\u27C9',
                    suphsub: '\u2AD7',
                    suplarr: '\u297B',
                    supmult: '\u2AC2',
                    supnE: '\u2ACC',
                    supne: '\u228B',
                    supplus: '\u2AC0',
                    supset: '\u2283',
                    Supset: '\u22D1',
                    supseteq: '\u2287',
                    supseteqq: '\u2AC6',
                    supsetneq: '\u228B',
                    supsetneqq: '\u2ACC',
                    supsim: '\u2AC8',
                    supsub: '\u2AD4',
                    supsup: '\u2AD6',
                    swarhk: '\u2926',
                    swarr: '\u2199',
                    swArr: '\u21D9',
                    swarrow: '\u2199',
                    swnwar: '\u292A',
                    szlig: 'ß',
                    Tab: '\t',
                    target: '\u2316',
                    Tau: 'Τ',
                    tau: 'τ',
                    tbrk: '\u23B4',
                    Tcaron: 'Ť',
                    tcaron: 'ť',
                    Tcedil: 'Ţ',
                    tcedil: 'ţ',
                    Tcy: 'Т',
                    tcy: 'т',
                    tdot: '⃛',
                    telrec: '\u2315',
                    Tfr: '\uD835\uDD17',
                    tfr: '\uD835\uDD31',
                    there4: '\u2234',
                    therefore: '\u2234',
                    Therefore: '\u2234',
                    Theta: 'Θ',
                    theta: 'θ',
                    thetasym: 'ϑ',
                    thetav: 'ϑ',
                    thickapprox: '\u2248',
                    thicksim: '\u223C',
                    ThickSpace: '\u205F\u200A',
                    ThinSpace: '\u2009',
                    thinsp: '\u2009',
                    thkap: '\u2248',
                    thksim: '\u223C',
                    THORN: 'Þ',
                    thorn: 'þ',
                    tilde: '\u02DC',
                    Tilde: '\u223C',
                    TildeEqual: '\u2243',
                    TildeFullEqual: '\u2245',
                    TildeTilde: '\u2248',
                    timesbar: '\u2A31',
                    timesb: '\u22A0',
                    times: '\xD7',
                    timesd: '\u2A30',
                    tint: '\u222D',
                    toea: '\u2928',
                    topbot: '\u2336',
                    topcir: '\u2AF1',
                    top: '\u22A4',
                    Topf: '\uD835\uDD4B',
                    topf: '\uD835\uDD65',
                    topfork: '\u2ADA',
                    tosa: '\u2929',
                    tprime: '\u2034',
                    trade: '\u2122',
                    TRADE: '\u2122',
                    triangle: '\u25B5',
                    triangledown: '\u25BF',
                    triangleleft: '\u25C3',
                    trianglelefteq: '\u22B4',
                    triangleq: '\u225C',
                    triangleright: '\u25B9',
                    trianglerighteq: '\u22B5',
                    tridot: '\u25EC',
                    trie: '\u225C',
                    triminus: '\u2A3A',
                    TripleDot: '⃛',
                    triplus: '\u2A39',
                    trisb: '\u29CD',
                    tritime: '\u2A3B',
                    trpezium: '\u23E2',
                    Tscr: '\uD835\uDCAF',
                    tscr: '\uD835\uDCC9',
                    TScy: 'Ц',
                    tscy: 'ц',
                    TSHcy: 'Ћ',
                    tshcy: 'ћ',
                    Tstrok: 'Ŧ',
                    tstrok: 'ŧ',
                    twixt: '\u226C',
                    twoheadleftarrow: '\u219E',
                    twoheadrightarrow: '\u21A0',
                    Uacute: 'Ú',
                    uacute: 'ú',
                    uarr: '\u2191',
                    Uarr: '\u219F',
                    uArr: '\u21D1',
                    Uarrocir: '\u2949',
                    Ubrcy: 'Ў',
                    ubrcy: 'ў',
                    Ubreve: 'Ŭ',
                    ubreve: 'ŭ',
                    Ucirc: 'Û',
                    ucirc: 'û',
                    Ucy: 'У',
                    ucy: 'у',
                    udarr: '\u21C5',
                    Udblac: 'Ű',
                    udblac: 'ű',
                    udhar: '\u296E',
                    ufisht: '\u297E',
                    Ufr: '\uD835\uDD18',
                    ufr: '\uD835\uDD32',
                    Ugrave: 'Ù',
                    ugrave: 'ù',
                    uHar: '\u2963',
                    uharl: '\u21BF',
                    uharr: '\u21BE',
                    uhblk: '\u2580',
                    ulcorn: '\u231C',
                    ulcorner: '\u231C',
                    ulcrop: '\u230F',
                    ultri: '\u25F8',
                    Umacr: 'Ū',
                    umacr: 'ū',
                    uml: '\xA8',
                    UnderBar: '_',
                    UnderBrace: '\u23DF',
                    UnderBracket: '\u23B5',
                    UnderParenthesis: '\u23DD',
                    Union: '\u22C3',
                    UnionPlus: '\u228E',
                    Uogon: 'Ų',
                    uogon: 'ų',
                    Uopf: '\uD835\uDD4C',
                    uopf: '\uD835\uDD66',
                    UpArrowBar: '\u2912',
                    uparrow: '\u2191',
                    UpArrow: '\u2191',
                    Uparrow: '\u21D1',
                    UpArrowDownArrow: '\u21C5',
                    updownarrow: '\u2195',
                    UpDownArrow: '\u2195',
                    Updownarrow: '\u21D5',
                    UpEquilibrium: '\u296E',
                    upharpoonleft: '\u21BF',
                    upharpoonright: '\u21BE',
                    uplus: '\u228E',
                    UpperLeftArrow: '\u2196',
                    UpperRightArrow: '\u2197',
                    upsi: 'υ',
                    Upsi: 'ϒ',
                    upsih: 'ϒ',
                    Upsilon: 'Υ',
                    upsilon: 'υ',
                    UpTeeArrow: '\u21A5',
                    UpTee: '\u22A5',
                    upuparrows: '\u21C8',
                    urcorn: '\u231D',
                    urcorner: '\u231D',
                    urcrop: '\u230E',
                    Uring: 'Ů',
                    uring: 'ů',
                    urtri: '\u25F9',
                    Uscr: '\uD835\uDCB0',
                    uscr: '\uD835\uDCCA',
                    utdot: '\u22F0',
                    Utilde: 'Ũ',
                    utilde: 'ũ',
                    utri: '\u25B5',
                    utrif: '\u25B4',
                    uuarr: '\u21C8',
                    Uuml: 'Ü',
                    uuml: 'ü',
                    uwangle: '\u29A7',
                    vangrt: '\u299C',
                    varepsilon: 'ϵ',
                    varkappa: 'ϰ',
                    varnothing: '\u2205',
                    varphi: 'ϕ',
                    varpi: 'ϖ',
                    varpropto: '\u221D',
                    varr: '\u2195',
                    vArr: '\u21D5',
                    varrho: 'ϱ',
                    varsigma: 'ς',
                    varsubsetneq: '\u228A︀',
                    varsubsetneqq: '\u2ACB︀',
                    varsupsetneq: '\u228B︀',
                    varsupsetneqq: '\u2ACC︀',
                    vartheta: 'ϑ',
                    vartriangleleft: '\u22B2',
                    vartriangleright: '\u22B3',
                    vBar: '\u2AE8',
                    Vbar: '\u2AEB',
                    vBarv: '\u2AE9',
                    Vcy: 'В',
                    vcy: 'в',
                    vdash: '\u22A2',
                    vDash: '\u22A8',
                    Vdash: '\u22A9',
                    VDash: '\u22AB',
                    Vdashl: '\u2AE6',
                    veebar: '\u22BB',
                    vee: '\u2228',
                    Vee: '\u22C1',
                    veeeq: '\u225A',
                    vellip: '\u22EE',
                    verbar: '|',
                    Verbar: '\u2016',
                    vert: '|',
                    Vert: '\u2016',
                    VerticalBar: '\u2223',
                    VerticalLine: '|',
                    VerticalSeparator: '\u2758',
                    VerticalTilde: '\u2240',
                    VeryThinSpace: '\u200A',
                    Vfr: '\uD835\uDD19',
                    vfr: '\uD835\uDD33',
                    vltri: '\u22B2',
                    vnsub: '\u2282⃒',
                    vnsup: '\u2283⃒',
                    Vopf: '\uD835\uDD4D',
                    vopf: '\uD835\uDD67',
                    vprop: '\u221D',
                    vrtri: '\u22B3',
                    Vscr: '\uD835\uDCB1',
                    vscr: '\uD835\uDCCB',
                    vsubnE: '\u2ACB︀',
                    vsubne: '\u228A︀',
                    vsupnE: '\u2ACC︀',
                    vsupne: '\u228B︀',
                    Vvdash: '\u22AA',
                    vzigzag: '\u299A',
                    Wcirc: 'Ŵ',
                    wcirc: 'ŵ',
                    wedbar: '\u2A5F',
                    wedge: '\u2227',
                    Wedge: '\u22C0',
                    wedgeq: '\u2259',
                    weierp: '\u2118',
                    Wfr: '\uD835\uDD1A',
                    wfr: '\uD835\uDD34',
                    Wopf: '\uD835\uDD4E',
                    wopf: '\uD835\uDD68',
                    wp: '\u2118',
                    wr: '\u2240',
                    wreath: '\u2240',
                    Wscr: '\uD835\uDCB2',
                    wscr: '\uD835\uDCCC',
                    xcap: '\u22C2',
                    xcirc: '\u25EF',
                    xcup: '\u22C3',
                    xdtri: '\u25BD',
                    Xfr: '\uD835\uDD1B',
                    xfr: '\uD835\uDD35',
                    xharr: '\u27F7',
                    xhArr: '\u27FA',
                    Xi: 'Ξ',
                    xi: 'ξ',
                    xlarr: '\u27F5',
                    xlArr: '\u27F8',
                    xmap: '\u27FC',
                    xnis: '\u22FB',
                    xodot: '\u2A00',
                    Xopf: '\uD835\uDD4F',
                    xopf: '\uD835\uDD69',
                    xoplus: '\u2A01',
                    xotime: '\u2A02',
                    xrarr: '\u27F6',
                    xrArr: '\u27F9',
                    Xscr: '\uD835\uDCB3',
                    xscr: '\uD835\uDCCD',
                    xsqcup: '\u2A06',
                    xuplus: '\u2A04',
                    xutri: '\u25B3',
                    xvee: '\u22C1',
                    xwedge: '\u22C0',
                    Yacute: 'Ý',
                    yacute: 'ý',
                    YAcy: 'Я',
                    yacy: 'я',
                    Ycirc: 'Ŷ',
                    ycirc: 'ŷ',
                    Ycy: 'Ы',
                    ycy: 'ы',
                    yen: '\xA5',
                    Yfr: '\uD835\uDD1C',
                    yfr: '\uD835\uDD36',
                    YIcy: 'Ї',
                    yicy: 'ї',
                    Yopf: '\uD835\uDD50',
                    yopf: '\uD835\uDD6A',
                    Yscr: '\uD835\uDCB4',
                    yscr: '\uD835\uDCCE',
                    YUcy: 'Ю',
                    yucy: 'ю',
                    yuml: 'ÿ',
                    Yuml: 'Ÿ',
                    Zacute: 'Ź',
                    zacute: 'ź',
                    Zcaron: 'Ž',
                    zcaron: 'ž',
                    Zcy: 'З',
                    zcy: 'з',
                    Zdot: 'Ż',
                    zdot: 'ż',
                    zeetrf: 'ℨ',
                    ZeroWidthSpace: '\u200B',
                    Zeta: 'Ζ',
                    zeta: 'ζ',
                    zfr: '\uD835\uDD37',
                    Zfr: 'ℨ',
                    ZHcy: 'Ж',
                    zhcy: 'ж',
                    zigrarr: '\u21DD',
                    zopf: '\uD835\uDD6B',
                    Zopf: 'ℤ',
                    Zscr: '\uD835\uDCB5',
                    zscr: '\uD835\uDCCF',
                    zwj: '‍',
                    zwnj: '‌'
                };
            },
            {}
        ],
        55: [
            function (e, r, t) {
                'use strict';
                function n(e) {
                    var r = Array.prototype.slice.call(arguments, 1);
                    return r.forEach(function (r) {
                        r && Object.keys(r).forEach(function (t) {
                            e[t] = r[t];
                        });
                    }), e;
                }
                function s(e) {
                    return Object.prototype.toString.call(e);
                }
                function o(e) {
                    return '[object String]' === s(e);
                }
                function i(e) {
                    return '[object Object]' === s(e);
                }
                function a(e) {
                    return '[object RegExp]' === s(e);
                }
                function c(e) {
                    return '[object Function]' === s(e);
                }
                function l(e) {
                    return e.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&');
                }
                function u(e) {
                    return Object.keys(e || {}).reduce(function (e, r) {
                        return e || k.hasOwnProperty(r);
                    }, !1);
                }
                function p(e) {
                    e.__index__ = -1, e.__text_cache__ = '';
                }
                function h(e) {
                    return function (r, t) {
                        var n = r.slice(t);
                        return e.test(n) ? n.match(e)[0].length : 0;
                    };
                }
                function f() {
                    return function (e, r) {
                        r.normalize(e);
                    };
                }
                function d(r) {
                    function t(e) {
                        return e.replace('%TLDS%', u.src_tlds);
                    }
                    function s(e, r) {
                        throw new Error('(LinkifyIt) Invalid schema "' + e + '": ' + r);
                    }
                    var u = r.re = n({}, e('./lib/re')), d = r.__tlds__.slice();
                    r.__tlds_replaced__ || d.push(v), d.push(u.src_xn), u.src_tlds = d.join('|'), u.email_fuzzy = RegExp(t(u.tpl_email_fuzzy), 'i'), u.link_fuzzy = RegExp(t(u.tpl_link_fuzzy), 'i'), u.link_no_ip_fuzzy = RegExp(t(u.tpl_link_no_ip_fuzzy), 'i'), u.host_fuzzy_test = RegExp(t(u.tpl_host_fuzzy_test), 'i');
                    var m = [];
                    r.__compiled__ = {}, Object.keys(r.__schemas__).forEach(function (e) {
                        var t = r.__schemas__[e];
                        if (null !== t) {
                            var n = {
                                validate: null,
                                link: null
                            };
                            return r.__compiled__[e] = n, i(t) ? (a(t.validate) ? n.validate = h(t.validate) : c(t.validate) ? n.validate = t.validate : s(e, t), void (c(t.normalize) ? n.normalize = t.normalize : t.normalize ? s(e, t) : n.normalize = f())) : o(t) ? void m.push(e) : void s(e, t);
                        }
                    }), m.forEach(function (e) {
                        r.__compiled__[r.__schemas__[e]] && (r.__compiled__[e].validate = r.__compiled__[r.__schemas__[e]].validate, r.__compiled__[e].normalize = r.__compiled__[r.__schemas__[e]].normalize);
                    }), r.__compiled__[''] = {
                        validate: null,
                        normalize: f()
                    };
                    var g = Object.keys(r.__compiled__).filter(function (e) {
                        return e.length > 0 && r.__compiled__[e];
                    }).map(l).join('|');
                    r.re.schema_test = RegExp('(^|(?!_)(?:>|' + u.src_ZPCc + '))(' + g + ')', 'i'), r.re.schema_search = RegExp('(^|(?!_)(?:>|' + u.src_ZPCc + '))(' + g + ')', 'ig'), r.re.pretest = RegExp('(' + r.re.schema_test.source + ')|(' + r.re.host_fuzzy_test.source + ')|@', 'i'), p(r);
                }
                function m(e, r) {
                    var t = e.__index__, n = e.__last_index__, s = e.__text_cache__.slice(t, n);
                    this.schema = e.__schema__.toLowerCase(), this.index = t + r, this.lastIndex = n + r, this.raw = s, this.text = s, this.url = s;
                }
                function g(e, r) {
                    var t = new m(e, r);
                    return e.__compiled__[t.schema].normalize(t, e), t;
                }
                function _(e, r) {
                    return this instanceof _ ? (r || u(e) && (r = e, e = {}), this.__opts__ = n({}, k, r), this.__index__ = -1, this.__last_index__ = -1, this.__schema__ = '', this.__text_cache__ = '', this.__schemas__ = n({}, b, e), this.__compiled__ = {}, this.__tlds__ = x, this.__tlds_replaced__ = !1, this.re = {}, void d(this)) : new _(e, r);
                }
                var k = {
                        fuzzyLink: !0,
                        fuzzyEmail: !0,
                        fuzzyIP: !1
                    }, b = {
                        'http:': {
                            validate: function (e, r, t) {
                                var n = e.slice(r);
                                return t.re.http || (t.re.http = new RegExp('^\\/\\/' + t.re.src_auth + t.re.src_host_port_strict + t.re.src_path, 'i')), t.re.http.test(n) ? n.match(t.re.http)[0].length : 0;
                            }
                        },
                        'https:': 'http:',
                        'ftp:': 'http:',
                        '//': {
                            validate: function (e, r, t) {
                                var n = e.slice(r);
                                return t.re.no_http || (t.re.no_http = new RegExp('^' + t.re.src_auth + t.re.src_host_port_strict + t.re.src_path, 'i')), t.re.no_http.test(n) ? r >= 3 && ':' === e[r - 3] ? 0 : n.match(t.re.no_http)[0].length : 0;
                            }
                        },
                        'mailto:': {
                            validate: function (e, r, t) {
                                var n = e.slice(r);
                                return t.re.mailto || (t.re.mailto = new RegExp('^' + t.re.src_email_name + '@' + t.re.src_host_strict, 'i')), t.re.mailto.test(n) ? n.match(t.re.mailto)[0].length : 0;
                            }
                        }
                    }, v = 'a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]', x = 'biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф'.split('|');
                _.prototype.add = function (e, r) {
                    return this.__schemas__[e] = r, d(this), this;
                }, _.prototype.set = function (e) {
                    return this.__opts__ = n(this.__opts__, e), this;
                }, _.prototype.test = function (e) {
                    if (this.__text_cache__ = e, this.__index__ = -1, !e.length)
                        return !1;
                    var r, t, n, s, o, i, a, c, l;
                    if (this.re.schema_test.test(e))
                        for (a = this.re.schema_search, a.lastIndex = 0; null !== (r = a.exec(e));)
                            if (s = this.testSchemaAt(e, r[2], a.lastIndex)) {
                                this.__schema__ = r[2], this.__index__ = r.index + r[1].length, this.__last_index__ = r.index + r[0].length + s;
                                break;
                            }
                    return this.__opts__.fuzzyLink && this.__compiled__['http:'] && (c = e.search(this.re.host_fuzzy_test), c >= 0 && (this.__index__ < 0 || c < this.__index__) && null !== (t = e.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy)) && (o = t.index + t[1].length, (this.__index__ < 0 || o < this.__index__) && (this.__schema__ = '', this.__index__ = o, this.__last_index__ = t.index + t[0].length))), this.__opts__.fuzzyEmail && this.__compiled__['mailto:'] && (l = e.indexOf('@'), l >= 0 && null !== (n = e.match(this.re.email_fuzzy)) && (o = n.index + n[1].length, i = n.index + n[0].length, (this.__index__ < 0 || o < this.__index__ || o === this.__index__ && i > this.__last_index__) && (this.__schema__ = 'mailto:', this.__index__ = o, this.__last_index__ = i))), this.__index__ >= 0;
                }, _.prototype.pretest = function (e) {
                    return this.re.pretest.test(e);
                }, _.prototype.testSchemaAt = function (e, r, t) {
                    return this.__compiled__[r.toLowerCase()] ? this.__compiled__[r.toLowerCase()].validate(e, t, this) : 0;
                }, _.prototype.match = function (e) {
                    var r = 0, t = [];
                    this.__index__ >= 0 && this.__text_cache__ === e && (t.push(g(this, r)), r = this.__last_index__);
                    for (var n = r ? e.slice(r) : e; this.test(n);)
                        t.push(g(this, r)), n = n.slice(this.__last_index__), r += this.__last_index__;
                    return t.length ? t : null;
                }, _.prototype.tlds = function (e, r) {
                    return e = Array.isArray(e) ? e : [e], r ? (this.__tlds__ = this.__tlds__.concat(e).sort().filter(function (e, r, t) {
                        return e !== t[r - 1];
                    }).reverse(), d(this), this) : (this.__tlds__ = e.slice(), this.__tlds_replaced__ = !0, d(this), this);
                }, _.prototype.normalize = function (e) {
                    e.schema || (e.url = 'http://' + e.url), 'mailto:' !== e.schema || /^mailto:/i.test(e.url) || (e.url = 'mailto:' + e.url);
                }, r.exports = _;
            },
            { './lib/re': 56 }
        ],
        56: [
            function (e, r, t) {
                'use strict';
                var n = t.src_Any = e('uc.micro/properties/Any/regex').source, s = t.src_Cc = e('uc.micro/categories/Cc/regex').source, o = t.src_Z = e('uc.micro/categories/Z/regex').source, i = t.src_P = e('uc.micro/categories/P/regex').source, a = t.src_ZPCc = [
                        o,
                        i,
                        s
                    ].join('|'), c = t.src_ZCc = [
                        o,
                        s
                    ].join('|'), l = '(?:(?!' + a + ')' + n + ')', u = '(?:(?![0-9]|' + a + ')' + n + ')', p = t.src_ip4 = '(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)';
                t.src_auth = '(?:(?:(?!' + c + ').)+@)?';
                var h = t.src_port = '(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?', f = t.src_host_terminator = '(?=$|' + a + ')(?!-|_|:\\d|\\.-|\\.(?!$|' + a + '))', d = t.src_path = '(?:[/?#](?:(?!' + c + '|[()[\\]{}.,"\'?!\\-]).|\\[(?:(?!' + c + '|\\]).)*\\]|\\((?:(?!' + c + '|[)]).)*\\)|\\{(?:(?!' + c + '|[}]).)*\\}|\\"(?:(?!' + c + '|["]).)+\\"|\\\'(?:(?!' + c + '|[\']).)+\\\'|\\\'(?=' + l + ').|\\.{2,3}[a-zA-Z0-9%/]|\\.(?!' + c + '|[.]).|\\-(?!--(?:[^-]|$))(?:-*)|\\,(?!' + c + ').|\\!(?!' + c + '|[!]).|\\?(?!' + c + '|[?]).)+|\\/)?', m = t.src_email_name = '[\\-;:&=\\+\\$,\\"\\.a-zA-Z0-9_]+', g = t.src_xn = 'xn--[a-z0-9\\-]{1,59}', _ = t.src_domain_root = '(?:' + g + '|' + u + '{1,63})', k = t.src_domain = '(?:' + g + '|(?:' + l + ')|(?:' + l + '(?:-(?!-)|' + l + '){0,61}' + l + '))', b = t.src_host = '(?:' + p + '|(?:(?:(?:' + k + ')\\.)*' + _ + '))', v = t.tpl_host_fuzzy = '(?:' + p + '|(?:(?:(?:' + k + ')\\.)+(?:%TLDS%)))', x = t.tpl_host_no_ip_fuzzy = '(?:(?:(?:' + k + ')\\.)+(?:%TLDS%))';
                t.src_host_strict = b + f;
                var y = t.tpl_host_fuzzy_strict = v + f;
                t.src_host_port_strict = b + h + f;
                var C = t.tpl_host_port_fuzzy_strict = v + h + f, A = t.tpl_host_port_no_ip_fuzzy_strict = x + h + f;
                t.tpl_host_fuzzy_test = 'localhost|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:' + a + '|$))', t.tpl_email_fuzzy = '(^|>|' + c + ')(' + m + '@' + y + ')', t.tpl_link_fuzzy = '(^|(?![.:/\\-_@])(?:[$+<=>^`|]|' + a + '))((?![$+<=>^`|])' + C + d + ')', t.tpl_link_no_ip_fuzzy = '(^|(?![.:/\\-_@])(?:[$+<=>^`|]|' + a + '))((?![$+<=>^`|])' + A + d + ')';
            },
            {
                'uc.micro/categories/Cc/regex': 62,
                'uc.micro/categories/P/regex': 64,
                'uc.micro/categories/Z/regex': 65,
                'uc.micro/properties/Any/regex': 67
            }
        ],
        57: [
            function (e, r, t) {
                'use strict';
                function n(e) {
                    var r, t, n = o[e];
                    if (n)
                        return n;
                    for (n = o[e] = [], r = 0; 128 > r; r++)
                        t = String.fromCharCode(r), n.push(t);
                    for (r = 0; r < e.length; r++)
                        t = e.charCodeAt(r), n[t] = '%' + ('0' + t.toString(16).toUpperCase()).slice(-2);
                    return n;
                }
                function s(e, r) {
                    var t;
                    return 'string' != typeof r && (r = s.defaultChars), t = n(r), e.replace(/(%[a-f0-9]{2})+/gi, function (e) {
                        var r, n, s, o, i, a, c, l = '';
                        for (r = 0, n = e.length; n > r; r += 3)
                            s = parseInt(e.slice(r + 1, r + 3), 16), 128 > s ? l += t[s] : 192 === (224 & s) && n > r + 3 && (o = parseInt(e.slice(r + 4, r + 6), 16), 128 === (192 & o)) ? (c = s << 6 & 1984 | 63 & o, l += 128 > c ? '\uFFFD\uFFFD' : String.fromCharCode(c), r += 3) : 224 === (240 & s) && n > r + 6 && (o = parseInt(e.slice(r + 4, r + 6), 16), i = parseInt(e.slice(r + 7, r + 9), 16), 128 === (192 & o) && 128 === (192 & i)) ? (c = s << 12 & 61440 | o << 6 & 4032 | 63 & i, l += 2048 > c || c >= 55296 && 57343 >= c ? '\uFFFD\uFFFD\uFFFD' : String.fromCharCode(c), r += 6) : 240 === (248 & s) && n > r + 9 && (o = parseInt(e.slice(r + 4, r + 6), 16), i = parseInt(e.slice(r + 7, r + 9), 16), a = parseInt(e.slice(r + 10, r + 12), 16), 128 === (192 & o) && 128 === (192 & i) && 128 === (192 & a)) ? (c = s << 18 & 1835008 | o << 12 & 258048 | i << 6 & 4032 | 63 & a, 65536 > c || c > 1114111 ? l += '\uFFFD\uFFFD\uFFFD\uFFFD' : (c -= 65536, l += String.fromCharCode(55296 + (c >> 10), 56320 + (1023 & c))), r += 9) : l += '\uFFFD';
                        return l;
                    });
                }
                var o = {};
                s.defaultChars = ';/?:@&=+$,#', s.componentChars = '', r.exports = s;
            },
            {}
        ],
        58: [
            function (e, r, t) {
                'use strict';
                function n(e) {
                    var r, t, n = o[e];
                    if (n)
                        return n;
                    for (n = o[e] = [], r = 0; 128 > r; r++)
                        t = String.fromCharCode(r), /^[0-9a-z]$/i.test(t) ? n.push(t) : n.push('%' + ('0' + r.toString(16).toUpperCase()).slice(-2));
                    for (r = 0; r < e.length; r++)
                        n[e.charCodeAt(r)] = e[r];
                    return n;
                }
                function s(e, r, t) {
                    var o, i, a, c, l, u = '';
                    for ('string' != typeof r && (t = r, r = s.defaultChars), 'undefined' == typeof t && (t = !0), l = n(r), o = 0, i = e.length; i > o; o++)
                        if (a = e.charCodeAt(o), t && 37 === a && i > o + 2 && /^[0-9a-f]{2}$/i.test(e.slice(o + 1, o + 3)))
                            u += e.slice(o, o + 3), o += 2;
                        else if (128 > a)
                            u += l[a];
                        else if (a >= 55296 && 57343 >= a) {
                            if (a >= 55296 && 56319 >= a && i > o + 1 && (c = e.charCodeAt(o + 1), c >= 56320 && 57343 >= c)) {
                                u += encodeURIComponent(e[o] + e[o + 1]), o++;
                                continue;
                            }
                            u += '%EF%BF%BD';
                        } else
                            u += encodeURIComponent(e[o]);
                    return u;
                }
                var o = {};
                s.defaultChars = ';/?:@&=+$,-_.!~*\'()#', s.componentChars = '-_.!~*\'()', r.exports = s;
            },
            {}
        ],
        59: [
            function (e, r, t) {
                'use strict';
                r.exports = function (e) {
                    var r = '';
                    return r += e.protocol || '', r += e.slashes ? '//' : '', r += e.auth ? e.auth + '@' : '', r += e.hostname && -1 !== e.hostname.indexOf(':') ? '[' + e.hostname + ']' : e.hostname || '', r += e.port ? ':' + e.port : '', r += e.pathname || '', r += e.search || '', r += e.hash || '';
                };
            },
            {}
        ],
        60: [
            function (e, r, t) {
                'use strict';
                r.exports.encode = e('./encode'), r.exports.decode = e('./decode'), r.exports.format = e('./format'), r.exports.parse = e('./parse');
            },
            {
                './decode': 57,
                './encode': 58,
                './format': 59,
                './parse': 61
            }
        ],
        61: [
            function (e, r, t) {
                'use strict';
                function n() {
                    this.protocol = null, this.slashes = null, this.auth = null, this.port = null, this.hostname = null, this.hash = null, this.search = null, this.pathname = null;
                }
                function s(e, r) {
                    if (e && e instanceof n)
                        return e;
                    var t = new n();
                    return t.parse(e, r), t;
                }
                var o = /^([a-z0-9.+-]+:)/i, i = /:[0-9]*$/, a = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/, c = [
                        '<',
                        '>',
                        '"',
                        '`',
                        ' ',
                        '\r',
                        '\n',
                        '\t'
                    ], l = [
                        '{',
                        '}',
                        '|',
                        '\\',
                        '^',
                        '`'
                    ].concat(c), u = ['\''].concat(l), p = [
                        '%',
                        '/',
                        '?',
                        ';',
                        '#'
                    ].concat(u), h = [
                        '/',
                        '?',
                        '#'
                    ], f = 255, d = /^[+a-z0-9A-Z_-]{0,63}$/, m = /^([+a-z0-9A-Z_-]{0,63})(.*)$/, g = {
                        javascript: !0,
                        'javascript:': !0
                    }, _ = {
                        http: !0,
                        https: !0,
                        ftp: !0,
                        gopher: !0,
                        file: !0,
                        'http:': !0,
                        'https:': !0,
                        'ftp:': !0,
                        'gopher:': !0,
                        'file:': !0
                    };
                n.prototype.parse = function (e, r) {
                    var t, n, s, i, c, l = e;
                    if (l = l.trim(), !r && 1 === e.split('#').length) {
                        var u = a.exec(l);
                        if (u)
                            return this.pathname = u[1], u[2] && (this.search = u[2]), this;
                    }
                    var k = o.exec(l);
                    if (k && (k = k[0], s = k.toLowerCase(), this.protocol = k, l = l.substr(k.length)), (r || k || l.match(/^\/\/[^@\/]+@[^@\/]+/)) && (c = '//' === l.substr(0, 2), !c || k && g[k] || (l = l.substr(2), this.slashes = !0)), !g[k] && (c || k && !_[k])) {
                        var b = -1;
                        for (t = 0; t < h.length; t++)
                            i = l.indexOf(h[t]), -1 !== i && (-1 === b || b > i) && (b = i);
                        var v, x;
                        for (x = -1 === b ? l.lastIndexOf('@') : l.lastIndexOf('@', b), -1 !== x && (v = l.slice(0, x), l = l.slice(x + 1), this.auth = v), b = -1, t = 0; t < p.length; t++)
                            i = l.indexOf(p[t]), -1 !== i && (-1 === b || b > i) && (b = i);
                        -1 === b && (b = l.length), ':' === l[b - 1] && b--;
                        var y = l.slice(0, b);
                        l = l.slice(b), this.parseHost(y), this.hostname = this.hostname || '';
                        var C = '[' === this.hostname[0] && ']' === this.hostname[this.hostname.length - 1];
                        if (!C) {
                            var A = this.hostname.split(/\./);
                            for (t = 0, n = A.length; n > t; t++) {
                                var w = A[t];
                                if (w && !w.match(d)) {
                                    for (var q = '', D = 0, E = w.length; E > D; D++)
                                        q += w.charCodeAt(D) > 127 ? 'x' : w[D];
                                    if (!q.match(d)) {
                                        var S = A.slice(0, t), F = A.slice(t + 1), z = w.match(m);
                                        z && (S.push(z[1]), F.unshift(z[2])), F.length && (l = F.join('.') + l), this.hostname = S.join('.');
                                        break;
                                    }
                                }
                            }
                        }
                        this.hostname.length > f && (this.hostname = ''), C && (this.hostname = this.hostname.substr(1, this.hostname.length - 2));
                    }
                    var L = l.indexOf('#');
                    -1 !== L && (this.hash = l.substr(L), l = l.slice(0, L));
                    var T = l.indexOf('?');
                    return -1 !== T && (this.search = l.substr(T), l = l.slice(0, T)), l && (this.pathname = l), _[s] && this.hostname && !this.pathname && (this.pathname = ''), this;
                }, n.prototype.parseHost = function (e) {
                    var r = i.exec(e);
                    r && (r = r[0], ':' !== r && (this.port = r.substr(1)), e = e.substr(0, e.length - r.length)), e && (this.hostname = e);
                }, r.exports = s;
            },
            {}
        ],
        62: [
            function (e, r, t) {
                r.exports = /[\0-\x1F\x7F-\x9F]/;
            },
            {}
        ],
        63: [
            function (e, r, t) {
                r.exports = /[\xAD\u0600-\u0605\u061C\u06DD\u070F\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804\uDCBD|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;
            },
            {}
        ],
        64: [
            function (e, r, t) {
                r.exports = /[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E42\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDE38-\uDE3D]|\uD805[\uDCC6\uDDC1-\uDDC9\uDE41-\uDE43]|\uD809[\uDC70-\uDC74]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD82F\uDC9F/;
            },
            {}
        ],
        65: [
            function (e, r, t) {
                r.exports = /[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;
            },
            {}
        ],
        66: [
            function (e, r, t) {
                r.exports.Any = e('./properties/Any/regex'), r.exports.Cc = e('./categories/Cc/regex'), r.exports.Cf = e('./categories/Cf/regex'), r.exports.P = e('./categories/P/regex'), r.exports.Z = e('./categories/Z/regex');
            },
            {
                './categories/Cc/regex': 62,
                './categories/Cf/regex': 63,
                './categories/P/regex': 64,
                './categories/Z/regex': 65,
                './properties/Any/regex': 67
            }
        ],
        67: [
            function (e, r, t) {
                r.exports = /[\0-\uD7FF\uDC00-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF]/;
            },
            {}
        ],
        68: [
            function (e, r, t) {
                'use strict';
                r.exports = e('./lib/');
            },
            { './lib/': 10 }
        ]
    }, {}, [68])(68);
});
'use strict';
var htmlTagRegex = /<html(.|\s)*>(.|\s)*<\/html>/im;
define('KnockoutMarkdownBinding', [
    'sanitizeCaja',
    'MarkdownIt'
], function (sanitizeCaja, MarkdownIt) {
    var KnockoutMarkdownBinding = {
        allowUnsafeHtml: false,
        register: function (Knockout) {
            Knockout.bindingHandlers.markdown = {
                'init': function () {
                    return { 'controlsDescendantBindings': true };
                },
                'update': function (element, valueAccessor) {
                    while (element.firstChild) {
                        Knockout.removeNode(element.firstChild);
                    }
                    var rawText = Knockout.unwrap(valueAccessor());
                    var html;
                    if (htmlTagRegex.test(rawText)) {
                        html = rawText;
                    } else {
                        html = markdownToHtml(rawText);
                    }
                    var nodes = Knockout.utils.parseHtmlFragment(html, element);
                    element.className = element.className + ' markdown';
                    for (var i = 0; i < nodes.length; ++i) {
                        var node = nodes[i];
                        setAnchorTargets(node);
                        element.appendChild(node);
                    }
                }
            };
        }
    };
    function markdownToHtml(markdownString) {
        var unsafeHtml = MarkdownIt.render(markdownString);
        if (KnockoutMarkdownBinding.allowUnsafeHtml) {
            return unsafeHtml;
        } else {
            return sanitizeCaja(unsafeHtml, cleanUrl, cleanId);
        }
    }
    function setAnchorTargets(element) {
        if (element instanceof HTMLAnchorElement) {
            element.target = '_blank';
        }
        if (element.childNodes && element.childNodes.length > 0) {
            for (var i = 0; i < element.childNodes.length; ++i) {
                setAnchorTargets(element.childNodes[i]);
            }
        }
    }
    function cleanUrl(url) {
        if (/^https?/.test(url.getScheme())) {
            return url.toString();
        }
        if (/^mailto?/.test(url.getScheme())) {
            return url.toString();
        }
        if (!url.getScheme() && !url.getDomain()) {
            return url.toString();
        }
        if ('data' === url.getScheme() && /^image/.test(url.getPath())) {
            return url.toString();
        }
    }
    function cleanId(id) {
        return id;
    }
    return KnockoutMarkdownBinding;
});
!function (a, b, c, d) {
    'use strict';
    function e(a, b, c) {
        return setTimeout(k(a, c), b);
    }
    function f(a, b, c) {
        return Array.isArray(a) ? (g(a, c[b], c), !0) : !1;
    }
    function g(a, b, c) {
        var e;
        if (a)
            if (a.forEach)
                a.forEach(b, c);
            else if (a.length !== d)
                for (e = 0; e < a.length;)
                    b.call(c, a[e], e, a), e++;
            else
                for (e in a)
                    a.hasOwnProperty(e) && b.call(c, a[e], e, a);
    }
    function h(a, b, c) {
        for (var e = Object.keys(b), f = 0; f < e.length;)
            (!c || c && a[e[f]] === d) && (a[e[f]] = b[e[f]]), f++;
        return a;
    }
    function i(a, b) {
        return h(a, b, !0);
    }
    function j(a, b, c) {
        var d, e = b.prototype;
        d = a.prototype = Object.create(e), d.constructor = a, d._super = e, c && h(d, c);
    }
    function k(a, b) {
        return function () {
            return a.apply(b, arguments);
        };
    }
    function l(a, b) {
        return typeof a == kb ? a.apply(b ? b[0] || d : d, b) : a;
    }
    function m(a, b) {
        return a === d ? b : a;
    }
    function n(a, b, c) {
        g(r(b), function (b) {
            a.addEventListener(b, c, !1);
        });
    }
    function o(a, b, c) {
        g(r(b), function (b) {
            a.removeEventListener(b, c, !1);
        });
    }
    function p(a, b) {
        for (; a;) {
            if (a == b)
                return !0;
            a = a.parentNode;
        }
        return !1;
    }
    function q(a, b) {
        return a.indexOf(b) > -1;
    }
    function r(a) {
        return a.trim().split(/\s+/g);
    }
    function s(a, b, c) {
        if (a.indexOf && !c)
            return a.indexOf(b);
        for (var d = 0; d < a.length;) {
            if (c && a[d][c] == b || !c && a[d] === b)
                return d;
            d++;
        }
        return -1;
    }
    function t(a) {
        return Array.prototype.slice.call(a, 0);
    }
    function u(a, b, c) {
        for (var d = [], e = [], f = 0; f < a.length;) {
            var g = b ? a[f][b] : a[f];
            s(e, g) < 0 && d.push(a[f]), e[f] = g, f++;
        }
        return c && (d = b ? d.sort(function (a, c) {
            return a[b] > c[b];
        }) : d.sort()), d;
    }
    function v(a, b) {
        for (var c, e, f = b[0].toUpperCase() + b.slice(1), g = 0; g < ib.length;) {
            if (c = ib[g], e = c ? c + f : b, e in a)
                return e;
            g++;
        }
        return d;
    }
    function w() {
        return ob++;
    }
    function x(a) {
        var b = a.ownerDocument;
        return b.defaultView || b.parentWindow;
    }
    function y(a, b) {
        var c = this;
        this.manager = a, this.callback = b, this.element = a.element, this.target = a.options.inputTarget, this.domHandler = function (b) {
            l(a.options.enable, [a]) && c.handler(b);
        }, this.init();
    }
    function z(a) {
        var b, c = a.options.inputClass;
        return new (b = c ? c : rb ? N : sb ? Q : qb ? S : M)(a, A);
    }
    function A(a, b, c) {
        var d = c.pointers.length, e = c.changedPointers.length, f = b & yb && d - e === 0, g = b & (Ab | Bb) && d - e === 0;
        c.isFirst = !!f, c.isFinal = !!g, f && (a.session = {}), c.eventType = b, B(a, c), a.emit('hammer.input', c), a.recognize(c), a.session.prevInput = c;
    }
    function B(a, b) {
        var c = a.session, d = b.pointers, e = d.length;
        c.firstInput || (c.firstInput = E(b)), e > 1 && !c.firstMultiple ? c.firstMultiple = E(b) : 1 === e && (c.firstMultiple = !1);
        var f = c.firstInput, g = c.firstMultiple, h = g ? g.center : f.center, i = b.center = F(d);
        b.timeStamp = nb(), b.deltaTime = b.timeStamp - f.timeStamp, b.angle = J(h, i), b.distance = I(h, i), C(c, b), b.offsetDirection = H(b.deltaX, b.deltaY), b.scale = g ? L(g.pointers, d) : 1, b.rotation = g ? K(g.pointers, d) : 0, D(c, b);
        var j = a.element;
        p(b.srcEvent.target, j) && (j = b.srcEvent.target), b.target = j;
    }
    function C(a, b) {
        var c = b.center, d = a.offsetDelta || {}, e = a.prevDelta || {}, f = a.prevInput || {};
        (b.eventType === yb || f.eventType === Ab) && (e = a.prevDelta = {
            x: f.deltaX || 0,
            y: f.deltaY || 0
        }, d = a.offsetDelta = {
            x: c.x,
            y: c.y
        }), b.deltaX = e.x + (c.x - d.x), b.deltaY = e.y + (c.y - d.y);
    }
    function D(a, b) {
        var c, e, f, g, h = a.lastInterval || b, i = b.timeStamp - h.timeStamp;
        if (b.eventType != Bb && (i > xb || h.velocity === d)) {
            var j = h.deltaX - b.deltaX, k = h.deltaY - b.deltaY, l = G(i, j, k);
            e = l.x, f = l.y, c = mb(l.x) > mb(l.y) ? l.x : l.y, g = H(j, k), a.lastInterval = b;
        } else
            c = h.velocity, e = h.velocityX, f = h.velocityY, g = h.direction;
        b.velocity = c, b.velocityX = e, b.velocityY = f, b.direction = g;
    }
    function E(a) {
        for (var b = [], c = 0; c < a.pointers.length;)
            b[c] = {
                clientX: lb(a.pointers[c].clientX),
                clientY: lb(a.pointers[c].clientY)
            }, c++;
        return {
            timeStamp: nb(),
            pointers: b,
            center: F(b),
            deltaX: a.deltaX,
            deltaY: a.deltaY
        };
    }
    function F(a) {
        var b = a.length;
        if (1 === b)
            return {
                x: lb(a[0].clientX),
                y: lb(a[0].clientY)
            };
        for (var c = 0, d = 0, e = 0; b > e;)
            c += a[e].clientX, d += a[e].clientY, e++;
        return {
            x: lb(c / b),
            y: lb(d / b)
        };
    }
    function G(a, b, c) {
        return {
            x: b / a || 0,
            y: c / a || 0
        };
    }
    function H(a, b) {
        return a === b ? Cb : mb(a) >= mb(b) ? a > 0 ? Db : Eb : b > 0 ? Fb : Gb;
    }
    function I(a, b, c) {
        c || (c = Kb);
        var d = b[c[0]] - a[c[0]], e = b[c[1]] - a[c[1]];
        return Math.sqrt(d * d + e * e);
    }
    function J(a, b, c) {
        c || (c = Kb);
        var d = b[c[0]] - a[c[0]], e = b[c[1]] - a[c[1]];
        return 180 * Math.atan2(e, d) / Math.PI;
    }
    function K(a, b) {
        return J(b[1], b[0], Lb) - J(a[1], a[0], Lb);
    }
    function L(a, b) {
        return I(b[0], b[1], Lb) / I(a[0], a[1], Lb);
    }
    function M() {
        this.evEl = Nb, this.evWin = Ob, this.allow = !0, this.pressed = !1, y.apply(this, arguments);
    }
    function N() {
        this.evEl = Rb, this.evWin = Sb, y.apply(this, arguments), this.store = this.manager.session.pointerEvents = [];
    }
    function O() {
        this.evTarget = Ub, this.evWin = Vb, this.started = !1, y.apply(this, arguments);
    }
    function P(a, b) {
        var c = t(a.touches), d = t(a.changedTouches);
        return b & (Ab | Bb) && (c = u(c.concat(d), 'identifier', !0)), [
            c,
            d
        ];
    }
    function Q() {
        this.evTarget = Xb, this.targetIds = {}, y.apply(this, arguments);
    }
    function R(a, b) {
        var c = t(a.touches), d = this.targetIds;
        if (b & (yb | zb) && 1 === c.length)
            return d[c[0].identifier] = !0, [
                c,
                c
            ];
        var e, f, g = t(a.changedTouches), h = [], i = this.target;
        if (f = c.filter(function (a) {
                return p(a.target, i);
            }), b === yb)
            for (e = 0; e < f.length;)
                d[f[e].identifier] = !0, e++;
        for (e = 0; e < g.length;)
            d[g[e].identifier] && h.push(g[e]), b & (Ab | Bb) && delete d[g[e].identifier], e++;
        return h.length ? [
            u(f.concat(h), 'identifier', !0),
            h
        ] : void 0;
    }
    function S() {
        y.apply(this, arguments);
        var a = k(this.handler, this);
        this.touch = new Q(this.manager, a), this.mouse = new M(this.manager, a);
    }
    function T(a, b) {
        this.manager = a, this.set(b);
    }
    function U(a) {
        if (q(a, bc))
            return bc;
        var b = q(a, cc), c = q(a, dc);
        return b && c ? cc + ' ' + dc : b || c ? b ? cc : dc : q(a, ac) ? ac : _b;
    }
    function V(a) {
        this.id = w(), this.manager = null, this.options = i(a || {}, this.defaults), this.options.enable = m(this.options.enable, !0), this.state = ec, this.simultaneous = {}, this.requireFail = [];
    }
    function W(a) {
        return a & jc ? 'cancel' : a & hc ? 'end' : a & gc ? 'move' : a & fc ? 'start' : '';
    }
    function X(a) {
        return a == Gb ? 'down' : a == Fb ? 'up' : a == Db ? 'left' : a == Eb ? 'right' : '';
    }
    function Y(a, b) {
        var c = b.manager;
        return c ? c.get(a) : a;
    }
    function Z() {
        V.apply(this, arguments);
    }
    function $() {
        Z.apply(this, arguments), this.pX = null, this.pY = null;
    }
    function _() {
        Z.apply(this, arguments);
    }
    function ab() {
        V.apply(this, arguments), this._timer = null, this._input = null;
    }
    function bb() {
        Z.apply(this, arguments);
    }
    function cb() {
        Z.apply(this, arguments);
    }
    function db() {
        V.apply(this, arguments), this.pTime = !1, this.pCenter = !1, this._timer = null, this._input = null, this.count = 0;
    }
    function eb(a, b) {
        return b = b || {}, b.recognizers = m(b.recognizers, eb.defaults.preset), new fb(a, b);
    }
    function fb(a, b) {
        b = b || {}, this.options = i(b, eb.defaults), this.options.inputTarget = this.options.inputTarget || a, this.handlers = {}, this.session = {}, this.recognizers = [], this.element = a, this.input = z(this), this.touchAction = new T(this, this.options.touchAction), gb(this, !0), g(b.recognizers, function (a) {
            var b = this.add(new a[0](a[1]));
            a[2] && b.recognizeWith(a[2]), a[3] && b.requireFailure(a[3]);
        }, this);
    }
    function gb(a, b) {
        var c = a.element;
        g(a.options.cssProps, function (a, d) {
            c.style[v(c.style, d)] = b ? a : '';
        });
    }
    function hb(a, c) {
        var d = b.createEvent('Event');
        d.initEvent(a, !0, !0), d.gesture = c, c.target.dispatchEvent(d);
    }
    var ib = [
            '',
            'webkit',
            'moz',
            'MS',
            'ms',
            'o'
        ], jb = b.createElement('div'), kb = 'function', lb = Math.round, mb = Math.abs, nb = Date.now, ob = 1, pb = /mobile|tablet|ip(ad|hone|od)|android/i, qb = 'ontouchstart' in a, rb = v(a, 'PointerEvent') !== d, sb = qb && pb.test(navigator.userAgent), tb = 'touch', ub = 'pen', vb = 'mouse', wb = 'kinect', xb = 25, yb = 1, zb = 2, Ab = 4, Bb = 8, Cb = 1, Db = 2, Eb = 4, Fb = 8, Gb = 16, Hb = Db | Eb, Ib = Fb | Gb, Jb = Hb | Ib, Kb = [
            'x',
            'y'
        ], Lb = [
            'clientX',
            'clientY'
        ];
    y.prototype = {
        handler: function () {
        },
        init: function () {
            this.evEl && n(this.element, this.evEl, this.domHandler), this.evTarget && n(this.target, this.evTarget, this.domHandler), this.evWin && n(x(this.element), this.evWin, this.domHandler);
        },
        destroy: function () {
            this.evEl && o(this.element, this.evEl, this.domHandler), this.evTarget && o(this.target, this.evTarget, this.domHandler), this.evWin && o(x(this.element), this.evWin, this.domHandler);
        }
    };
    var Mb = {
            mousedown: yb,
            mousemove: zb,
            mouseup: Ab
        }, Nb = 'mousedown', Ob = 'mousemove mouseup';
    j(M, y, {
        handler: function (a) {
            var b = Mb[a.type];
            b & yb && 0 === a.button && (this.pressed = !0), b & zb && 1 !== a.which && (b = Ab), this.pressed && this.allow && (b & Ab && (this.pressed = !1), this.callback(this.manager, b, {
                pointers: [a],
                changedPointers: [a],
                pointerType: vb,
                srcEvent: a
            }));
        }
    });
    var Pb = {
            pointerdown: yb,
            pointermove: zb,
            pointerup: Ab,
            pointercancel: Bb,
            pointerout: Bb
        }, Qb = {
            2: tb,
            3: ub,
            4: vb,
            5: wb
        }, Rb = 'pointerdown', Sb = 'pointermove pointerup pointercancel';
    a.MSPointerEvent && (Rb = 'MSPointerDown', Sb = 'MSPointerMove MSPointerUp MSPointerCancel'), j(N, y, {
        handler: function (a) {
            var b = this.store, c = !1, d = a.type.toLowerCase().replace('ms', ''), e = Pb[d], f = Qb[a.pointerType] || a.pointerType, g = f == tb, h = s(b, a.pointerId, 'pointerId');
            e & yb && (0 === a.button || g) ? 0 > h && (b.push(a), h = b.length - 1) : e & (Ab | Bb) && (c = !0), 0 > h || (b[h] = a, this.callback(this.manager, e, {
                pointers: b,
                changedPointers: [a],
                pointerType: f,
                srcEvent: a
            }), c && b.splice(h, 1));
        }
    });
    var Tb = {
            touchstart: yb,
            touchmove: zb,
            touchend: Ab,
            touchcancel: Bb
        }, Ub = 'touchstart', Vb = 'touchstart touchmove touchend touchcancel';
    j(O, y, {
        handler: function (a) {
            var b = Tb[a.type];
            if (b === yb && (this.started = !0), this.started) {
                var c = P.call(this, a, b);
                b & (Ab | Bb) && c[0].length - c[1].length === 0 && (this.started = !1), this.callback(this.manager, b, {
                    pointers: c[0],
                    changedPointers: c[1],
                    pointerType: tb,
                    srcEvent: a
                });
            }
        }
    });
    var Wb = {
            touchstart: yb,
            touchmove: zb,
            touchend: Ab,
            touchcancel: Bb
        }, Xb = 'touchstart touchmove touchend touchcancel';
    j(Q, y, {
        handler: function (a) {
            var b = Wb[a.type], c = R.call(this, a, b);
            c && this.callback(this.manager, b, {
                pointers: c[0],
                changedPointers: c[1],
                pointerType: tb,
                srcEvent: a
            });
        }
    }), j(S, y, {
        handler: function (a, b, c) {
            var d = c.pointerType == tb, e = c.pointerType == vb;
            if (d)
                this.mouse.allow = !1;
            else if (e && !this.mouse.allow)
                return;
            b & (Ab | Bb) && (this.mouse.allow = !0), this.callback(a, b, c);
        },
        destroy: function () {
            this.touch.destroy(), this.mouse.destroy();
        }
    });
    var Yb = v(jb.style, 'touchAction'), Zb = Yb !== d, $b = 'compute', _b = 'auto', ac = 'manipulation', bc = 'none', cc = 'pan-x', dc = 'pan-y';
    T.prototype = {
        set: function (a) {
            a == $b && (a = this.compute()), Zb && (this.manager.element.style[Yb] = a), this.actions = a.toLowerCase().trim();
        },
        update: function () {
            this.set(this.manager.options.touchAction);
        },
        compute: function () {
            var a = [];
            return g(this.manager.recognizers, function (b) {
                l(b.options.enable, [b]) && (a = a.concat(b.getTouchAction()));
            }), U(a.join(' '));
        },
        preventDefaults: function (a) {
            if (!Zb) {
                var b = a.srcEvent, c = a.offsetDirection;
                if (this.manager.session.prevented)
                    return void b.preventDefault();
                var d = this.actions, e = q(d, bc), f = q(d, dc), g = q(d, cc);
                return e || f && c & Hb || g && c & Ib ? this.preventSrc(b) : void 0;
            }
        },
        preventSrc: function (a) {
            this.manager.session.prevented = !0, a.preventDefault();
        }
    };
    var ec = 1, fc = 2, gc = 4, hc = 8, ic = hc, jc = 16, kc = 32;
    V.prototype = {
        defaults: {},
        set: function (a) {
            return h(this.options, a), this.manager && this.manager.touchAction.update(), this;
        },
        recognizeWith: function (a) {
            if (f(a, 'recognizeWith', this))
                return this;
            var b = this.simultaneous;
            return a = Y(a, this), b[a.id] || (b[a.id] = a, a.recognizeWith(this)), this;
        },
        dropRecognizeWith: function (a) {
            return f(a, 'dropRecognizeWith', this) ? this : (a = Y(a, this), delete this.simultaneous[a.id], this);
        },
        requireFailure: function (a) {
            if (f(a, 'requireFailure', this))
                return this;
            var b = this.requireFail;
            return a = Y(a, this), -1 === s(b, a) && (b.push(a), a.requireFailure(this)), this;
        },
        dropRequireFailure: function (a) {
            if (f(a, 'dropRequireFailure', this))
                return this;
            a = Y(a, this);
            var b = s(this.requireFail, a);
            return b > -1 && this.requireFail.splice(b, 1), this;
        },
        hasRequireFailures: function () {
            return this.requireFail.length > 0;
        },
        canRecognizeWith: function (a) {
            return !!this.simultaneous[a.id];
        },
        emit: function (a) {
            function b(b) {
                c.manager.emit(c.options.event + (b ? W(d) : ''), a);
            }
            var c = this, d = this.state;
            hc > d && b(!0), b(), d >= hc && b(!0);
        },
        tryEmit: function (a) {
            return this.canEmit() ? this.emit(a) : void (this.state = kc);
        },
        canEmit: function () {
            for (var a = 0; a < this.requireFail.length;) {
                if (!(this.requireFail[a].state & (kc | ec)))
                    return !1;
                a++;
            }
            return !0;
        },
        recognize: function (a) {
            var b = h({}, a);
            return l(this.options.enable, [
                this,
                b
            ]) ? (this.state & (ic | jc | kc) && (this.state = ec), this.state = this.process(b), void (this.state & (fc | gc | hc | jc) && this.tryEmit(b))) : (this.reset(), void (this.state = kc));
        },
        process: function () {
        },
        getTouchAction: function () {
        },
        reset: function () {
        }
    }, j(Z, V, {
        defaults: { pointers: 1 },
        attrTest: function (a) {
            var b = this.options.pointers;
            return 0 === b || a.pointers.length === b;
        },
        process: function (a) {
            var b = this.state, c = a.eventType, d = b & (fc | gc), e = this.attrTest(a);
            return d && (c & Bb || !e) ? b | jc : d || e ? c & Ab ? b | hc : b & fc ? b | gc : fc : kc;
        }
    }), j($, Z, {
        defaults: {
            event: 'pan',
            threshold: 10,
            pointers: 1,
            direction: Jb
        },
        getTouchAction: function () {
            var a = this.options.direction, b = [];
            return a & Hb && b.push(dc), a & Ib && b.push(cc), b;
        },
        directionTest: function (a) {
            var b = this.options, c = !0, d = a.distance, e = a.direction, f = a.deltaX, g = a.deltaY;
            return e & b.direction || (b.direction & Hb ? (e = 0 === f ? Cb : 0 > f ? Db : Eb, c = f != this.pX, d = Math.abs(a.deltaX)) : (e = 0 === g ? Cb : 0 > g ? Fb : Gb, c = g != this.pY, d = Math.abs(a.deltaY))), a.direction = e, c && d > b.threshold && e & b.direction;
        },
        attrTest: function (a) {
            return Z.prototype.attrTest.call(this, a) && (this.state & fc || !(this.state & fc) && this.directionTest(a));
        },
        emit: function (a) {
            this.pX = a.deltaX, this.pY = a.deltaY;
            var b = X(a.direction);
            b && this.manager.emit(this.options.event + b, a), this._super.emit.call(this, a);
        }
    }), j(_, Z, {
        defaults: {
            event: 'pinch',
            threshold: 0,
            pointers: 2
        },
        getTouchAction: function () {
            return [bc];
        },
        attrTest: function (a) {
            return this._super.attrTest.call(this, a) && (Math.abs(a.scale - 1) > this.options.threshold || this.state & fc);
        },
        emit: function (a) {
            if (this._super.emit.call(this, a), 1 !== a.scale) {
                var b = a.scale < 1 ? 'in' : 'out';
                this.manager.emit(this.options.event + b, a);
            }
        }
    }), j(ab, V, {
        defaults: {
            event: 'press',
            pointers: 1,
            time: 500,
            threshold: 5
        },
        getTouchAction: function () {
            return [_b];
        },
        process: function (a) {
            var b = this.options, c = a.pointers.length === b.pointers, d = a.distance < b.threshold, f = a.deltaTime > b.time;
            if (this._input = a, !d || !c || a.eventType & (Ab | Bb) && !f)
                this.reset();
            else if (a.eventType & yb)
                this.reset(), this._timer = e(function () {
                    this.state = ic, this.tryEmit();
                }, b.time, this);
            else if (a.eventType & Ab)
                return ic;
            return kc;
        },
        reset: function () {
            clearTimeout(this._timer);
        },
        emit: function (a) {
            this.state === ic && (a && a.eventType & Ab ? this.manager.emit(this.options.event + 'up', a) : (this._input.timeStamp = nb(), this.manager.emit(this.options.event, this._input)));
        }
    }), j(bb, Z, {
        defaults: {
            event: 'rotate',
            threshold: 0,
            pointers: 2
        },
        getTouchAction: function () {
            return [bc];
        },
        attrTest: function (a) {
            return this._super.attrTest.call(this, a) && (Math.abs(a.rotation) > this.options.threshold || this.state & fc);
        }
    }), j(cb, Z, {
        defaults: {
            event: 'swipe',
            threshold: 10,
            velocity: 0.65,
            direction: Hb | Ib,
            pointers: 1
        },
        getTouchAction: function () {
            return $.prototype.getTouchAction.call(this);
        },
        attrTest: function (a) {
            var b, c = this.options.direction;
            return c & (Hb | Ib) ? b = a.velocity : c & Hb ? b = a.velocityX : c & Ib && (b = a.velocityY), this._super.attrTest.call(this, a) && c & a.direction && a.distance > this.options.threshold && mb(b) > this.options.velocity && a.eventType & Ab;
        },
        emit: function (a) {
            var b = X(a.direction);
            b && this.manager.emit(this.options.event + b, a), this.manager.emit(this.options.event, a);
        }
    }), j(db, V, {
        defaults: {
            event: 'tap',
            pointers: 1,
            taps: 1,
            interval: 300,
            time: 250,
            threshold: 2,
            posThreshold: 10
        },
        getTouchAction: function () {
            return [ac];
        },
        process: function (a) {
            var b = this.options, c = a.pointers.length === b.pointers, d = a.distance < b.threshold, f = a.deltaTime < b.time;
            if (this.reset(), a.eventType & yb && 0 === this.count)
                return this.failTimeout();
            if (d && f && c) {
                if (a.eventType != Ab)
                    return this.failTimeout();
                var g = this.pTime ? a.timeStamp - this.pTime < b.interval : !0, h = !this.pCenter || I(this.pCenter, a.center) < b.posThreshold;
                this.pTime = a.timeStamp, this.pCenter = a.center, h && g ? this.count += 1 : this.count = 1, this._input = a;
                var i = this.count % b.taps;
                if (0 === i)
                    return this.hasRequireFailures() ? (this._timer = e(function () {
                        this.state = ic, this.tryEmit();
                    }, b.interval, this), fc) : ic;
            }
            return kc;
        },
        failTimeout: function () {
            return this._timer = e(function () {
                this.state = kc;
            }, this.options.interval, this), kc;
        },
        reset: function () {
            clearTimeout(this._timer);
        },
        emit: function () {
            this.state == ic && (this._input.tapCount = this.count, this.manager.emit(this.options.event, this._input));
        }
    }), eb.VERSION = '2.0.4', eb.defaults = {
        domEvents: !1,
        touchAction: $b,
        enable: !0,
        inputTarget: null,
        inputClass: null,
        preset: [
            [
                bb,
                { enable: !1 }
            ],
            [
                _,
                { enable: !1 },
                ['rotate']
            ],
            [
                cb,
                { direction: Hb }
            ],
            [
                $,
                { direction: Hb },
                ['swipe']
            ],
            [db],
            [
                db,
                {
                    event: 'doubletap',
                    taps: 2
                },
                ['tap']
            ],
            [ab]
        ],
        cssProps: {
            userSelect: 'none',
            touchSelect: 'none',
            touchCallout: 'none',
            contentZooming: 'none',
            userDrag: 'none',
            tapHighlightColor: 'rgba(0,0,0,0)'
        }
    };
    var lc = 1, mc = 2;
    fb.prototype = {
        set: function (a) {
            return h(this.options, a), a.touchAction && this.touchAction.update(), a.inputTarget && (this.input.destroy(), this.input.target = a.inputTarget, this.input.init()), this;
        },
        stop: function (a) {
            this.session.stopped = a ? mc : lc;
        },
        recognize: function (a) {
            var b = this.session;
            if (!b.stopped) {
                this.touchAction.preventDefaults(a);
                var c, d = this.recognizers, e = b.curRecognizer;
                (!e || e && e.state & ic) && (e = b.curRecognizer = null);
                for (var f = 0; f < d.length;)
                    c = d[f], b.stopped === mc || e && c != e && !c.canRecognizeWith(e) ? c.reset() : c.recognize(a), !e && c.state & (fc | gc | hc) && (e = b.curRecognizer = c), f++;
            }
        },
        get: function (a) {
            if (a instanceof V)
                return a;
            for (var b = this.recognizers, c = 0; c < b.length; c++)
                if (b[c].options.event == a)
                    return b[c];
            return null;
        },
        add: function (a) {
            if (f(a, 'add', this))
                return this;
            var b = this.get(a.options.event);
            return b && this.remove(b), this.recognizers.push(a), a.manager = this, this.touchAction.update(), a;
        },
        remove: function (a) {
            if (f(a, 'remove', this))
                return this;
            var b = this.recognizers;
            return a = this.get(a), b.splice(s(b, a), 1), this.touchAction.update(), this;
        },
        on: function (a, b) {
            var c = this.handlers;
            return g(r(a), function (a) {
                c[a] = c[a] || [], c[a].push(b);
            }), this;
        },
        off: function (a, b) {
            var c = this.handlers;
            return g(r(a), function (a) {
                b ? c[a].splice(s(c[a], b), 1) : delete c[a];
            }), this;
        },
        emit: function (a, b) {
            this.options.domEvents && hb(a, b);
            var c = this.handlers[a] && this.handlers[a].slice();
            if (c && c.length) {
                b.type = a, b.preventDefault = function () {
                    b.srcEvent.preventDefault();
                };
                for (var d = 0; d < c.length;)
                    c[d](b), d++;
            }
        },
        destroy: function () {
            this.element && gb(this, !1), this.handlers = {}, this.session = {}, this.input.destroy(), this.element = null;
        }
    }, h(eb, {
        INPUT_START: yb,
        INPUT_MOVE: zb,
        INPUT_END: Ab,
        INPUT_CANCEL: Bb,
        STATE_POSSIBLE: ec,
        STATE_BEGAN: fc,
        STATE_CHANGED: gc,
        STATE_ENDED: hc,
        STATE_RECOGNIZED: ic,
        STATE_CANCELLED: jc,
        STATE_FAILED: kc,
        DIRECTION_NONE: Cb,
        DIRECTION_LEFT: Db,
        DIRECTION_RIGHT: Eb,
        DIRECTION_UP: Fb,
        DIRECTION_DOWN: Gb,
        DIRECTION_HORIZONTAL: Hb,
        DIRECTION_VERTICAL: Ib,
        DIRECTION_ALL: Jb,
        Manager: fb,
        Input: y,
        TouchAction: T,
        TouchInput: Q,
        MouseInput: M,
        PointerEventInput: N,
        TouchMouseInput: S,
        SingleTouchInput: O,
        Recognizer: V,
        AttrRecognizer: Z,
        Tap: db,
        Pan: $,
        Swipe: cb,
        Pinch: _,
        Rotate: bb,
        Press: ab,
        on: n,
        off: o,
        each: g,
        merge: i,
        extend: h,
        inherit: j,
        bindFn: k,
        prefixed: v
    }), typeof define == kb && define.amd ? define('Hammer', [], function () {
        return eb;
    }) : 'undefined' != typeof module && module.exports ? module.exports = eb : a[c] = eb;
}(window, document, 'Hammer');
'use strict';
define('KnockoutHammerBinding', [
    'Knockout',
    'Hammer'
], function (Knockout, hammerjs) {
    var KnockoutHammerBinding = {
        register: function (Knockout) {
            Knockout.bindingHandlers.swipeLeft = {
                init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                    var f = Knockout.unwrap(valueAccessor());
                    new Hammer(element).on('swipeleft', function (e) {
                        var viewModel = bindingContext.$data;
                        f.apply(viewModel, arguments);
                    });
                }
            };
            Knockout.bindingHandlers.swipeRight = {
                init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                    var f = Knockout.unwrap(valueAccessor());
                    new Hammer(element).on('swiperight', function (e) {
                        var viewModel = bindingContext.$data;
                        f.apply(viewModel, arguments);
                    });
                }
            };
        }
    };
    return KnockoutHammerBinding;
});
'use strict';
define('registerKnockoutBindings', [
    'Knockout',
    'KnockoutMarkdownBinding',
    'KnockoutHammerBinding'
], function (Knockout, KnockoutMarkdownBinding, KnockoutHammerBinding) {
    var registerKnockoutBindings = function () {
        Cesium.SvgPathBindingHandler.register(Knockout);
        KnockoutMarkdownBinding.register(Knockout);
        KnockoutHammerBinding.register(Knockout);
        Knockout.bindingHandlers.embeddedComponent = {
            init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                var component = Knockout.unwrap(valueAccessor());
                component.show(element);
                return { controlsDescendantBindings: true };
            },
            update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            }
        };
    };
    return registerKnockoutBindings;
});
'use strict';
define('DistanceLegendViewModel', [
    'Knockout',
    'loadView'
], function (Knockout, loadView) {
    var DistanceLegendViewModel = function (options) {
        if (!Cesium.defined(options) || !Cesium.defined(options.terria)) {
            throw new DeveloperError('options.terria is required.');
            console.log('options.terria is required.');
        }
        this.terria = options.terria;
        this._removeSubscription = undefined;
        this._lastLegendUpdate = undefined;
        this.eventHelper = new Cesium.EventHelper();
        this.distanceLabel = undefined;
        this.barWidth = undefined;
        Knockout.track(this, [
            'distanceLabel',
            'barWidth'
        ]);
        this.eventHelper.add(this.terria.afterViewerChanged, function () {
            if (Cesium.defined(this._removeSubscription)) {
                this._removeSubscription();
                this._removeSubscription = undefined;
            }
        }, this);
        var that = this;
        function addUpdateSubscription() {
            if (Cesium.defined(that.terria)) {
                var scene = that.terria.scene;
                that._removeSubscription = scene.postRender.addEventListener(function () {
                    updateDistanceLegendCesium(this, scene);
                }, that);
            } else if (Cesium.defined(that.terria.leaflet)) {
                var map = that.terria.leaflet.map;
                var potentialChangeCallback = function potentialChangeCallback() {
                    updateDistanceLegendLeaflet(that, map);
                };
                that._removeSubscription = function () {
                    map.off('zoomend', potentialChangeCallback);
                    map.off('moveend', potentialChangeCallback);
                };
                map.on('zoomend', potentialChangeCallback);
                map.on('moveend', potentialChangeCallback);
                updateDistanceLegendLeaflet(that, map);
            }
        }
        addUpdateSubscription();
        this.eventHelper.add(this.terria.afterViewerChanged, function () {
            addUpdateSubscription();
        }, this);
    };
    DistanceLegendViewModel.prototype.destroy = function () {
        this.eventHelper.removeAll();
    };
    DistanceLegendViewModel.prototype.show = function (container) {
        var testing = '<div class="distance-legend" data-bind="visible: distanceLabel && barWidth">' + '<div class="distance-legend-label" data-bind="text: distanceLabel"></div>' + '<div class="distance-legend-scale-bar" data-bind="style: { width: barWidth + \'px\', left: (5 + (125 - barWidth) / 2) + \'px\' }"></div>' + '</div>';
        loadView(testing, container, this);
    };
    DistanceLegendViewModel.create = function (options) {
        var result = new DistanceLegendViewModel(options);
        result.show(options.container);
        return result;
    };
    var geodesic = new Cesium.EllipsoidGeodesic();
    var distances = [
        1,
        2,
        3,
        5,
        10,
        20,
        30,
        50,
        100,
        200,
        300,
        500,
        1000,
        2000,
        3000,
        5000,
        10000,
        20000,
        30000,
        50000,
        100000,
        200000,
        300000,
        500000,
        1000000,
        2000000,
        3000000,
        5000000,
        10000000,
        20000000,
        30000000,
        50000000
    ];
    function updateDistanceLegendCesium(viewModel, scene) {
        var now = Cesium.getTimestamp();
        if (now < viewModel._lastLegendUpdate + 250) {
            return;
        }
        viewModel._lastLegendUpdate = now;
        var width = scene.canvas.clientWidth;
        var height = scene.canvas.clientHeight;
        var left = scene.camera.getPickRay(new Cesium.Cartesian2(width / 2 | 0, height - 1));
        var right = scene.camera.getPickRay(new Cesium.Cartesian2(1 + width / 2 | 0, height - 1));
        var globe = scene.globe;
        var leftPosition = globe.pick(left, scene);
        var rightPosition = globe.pick(right, scene);
        if (!Cesium.defined(leftPosition) || !Cesium.defined(rightPosition)) {
            viewModel.barWidth = undefined;
            viewModel.distanceLabel = undefined;
            return;
        }
        var leftCartographic = globe.ellipsoid.cartesianToCartographic(leftPosition);
        var rightCartographic = globe.ellipsoid.cartesianToCartographic(rightPosition);
        geodesic.setEndPoints(leftCartographic, rightCartographic);
        var pixelDistance = geodesic.surfaceDistance;
        var maxBarWidth = 100;
        var distance;
        for (var i = distances.length - 1; !Cesium.defined(distance) && i >= 0; --i) {
            if (distances[i] / pixelDistance < maxBarWidth) {
                distance = distances[i];
            }
        }
        if (Cesium.defined(distance)) {
            var label;
            if (distance >= 1000) {
                label = (distance / 1000).toString() + ' km';
            } else {
                label = distance.toString() + ' m';
            }
            viewModel.barWidth = distance / pixelDistance | 0;
            viewModel.distanceLabel = label;
        } else {
            viewModel.barWidth = undefined;
            viewModel.distanceLabel = undefined;
        }
    }
    function updateDistanceLegendLeaflet(viewModel, map) {
        var halfHeight = map.getSize().y / 2;
        var maxPixelWidth = 100;
        var maxMeters = map.containerPointToLatLng([
            0,
            halfHeight
        ]).distanceTo(map.containerPointToLatLng([
            maxPixelWidth,
            halfHeight
        ]));
        var meters = L.control.scale()._getRoundNum(maxMeters);
        var label = meters < 1000 ? meters + ' m' : meters / 1000 + ' km';
        viewModel.barWidth = meters / maxMeters * maxPixelWidth;
        viewModel.distanceLabel = label;
    }
    return DistanceLegendViewModel;
});
'use strict';
define('CameraView', [], function () {
    var CameraView = function (rectangle, position, direction, up) {
        if (!Cesium.defined(rectangle)) {
            console.log('rectangle is required.');
        }
        if (Cesium.defined(position) || Cesium.defined(direction) || Cesium.defined(up)) {
            if (!Cesium.defined(position) || !Cesium.defined(direction) || !Cesium.defined(up)) {
                console.log('If any of position, direction, or up are specified, all must be specified.');
            }
        }
        this._rectangle = rectangle;
        this._position = position;
        this._direction = direction;
        this._up = up;
    };
    Cesium.defineProperties(CameraView.prototype, {
        rectangle: {
            get: function () {
                return this._rectangle;
            }
        },
        position: {
            get: function () {
                return this._position;
            }
        },
        direction: {
            get: function () {
                return this._direction;
            }
        },
        up: {
            get: function () {
                return this._up;
            }
        }
    });
    return CameraView;
});
define('Navigation', [
    'Knockout',
    'NavigationViewModel',
    'registerKnockoutBindings',
    'DistanceLegendViewModel',
    'CameraView'
], function (Knockout, NavigationViewModel, registerKnockoutBindings, DistanceLegendViewModel, CameraView) {
    return {
        distanceLegendViewModel: undefined,
        navigationViewModel: undefined,
        navigationDiv: undefined,
        distanceLegendDiv: undefined,
        terria: undefined,
        initialize: function (mapContainer, terria) {
            this.terria = terria;
            this.terria.afterViewerChanged = new Cesium.Event();
            this.terria.beforeViewerChanged = new Cesium.Event();
            this.terria.currentViewer = viewer;
            this.navigationDiv = document.createElement('div');
            this.navigationDiv.setAttribute('id', 'navigationDiv');
            this.navigationDiv.style.display = 'inline-block';
            this.navigationDiv.style.margin = '2px';
            this.navigationDiv.style.position = 'absolute';
            this.navigationDiv.style.right = '0px';
            this.navigationDiv.style.height = '45px';
            this.navigationDiv.style.top = '34px';
            this.navigationDiv.style.zIndex = '300';
            this.distanceLegendDiv = document.createElement('div');
            mapContainer.appendChild(this.navigationDiv);
            mapContainer.appendChild(this.distanceLegendDiv);
            this.terria.homeView = new CameraView(Cesium.Rectangle.MAX_VALUE);
            registerKnockoutBindings();
            this.distanceLegendViewModel = DistanceLegendViewModel.create({
                container: this.distanceLegendDiv,
                terria: this.terria,
                mapElement: mapContainer
            });
            this.navigationViewModel = NavigationViewModel.create({
                container: this.navigationDiv,
                terria: this.terria
            });
        },
        destroy: function () {
            if (this.navigationViewModel)
                this.navigationViewModel.destroy();
            if (this.distanceLegendViewModel)
                this.distanceLegendViewModel.destroy();
            if (this.navigationDiv)
                this.navigationDiv.parentNode.removeChild(this.navigationDiv);
            this.navigationDiv = undefined;
            if (this.distanceLegendDiv)
                this.distanceLegendDiv.parentNode.removeChild(this.distanceLegendDiv);
            this.distanceLegendDiv = undefined;
            if (this.terria)
                this.terria.homeView = undefined;
        }
    };
});
var startupScriptRegex = /(.*?)(cesium-navigation)\w*\.js(?:\W|$)/i;
function getBaseTerriaNavigationUrl() {
    var manifestUrl = window.location.href;
    var scripts = document.getElementsByTagName('script');
    for (var i = 0, len = scripts.length; i < len; ++i) {
        var src = scripts[i].getAttribute('src');
        if (src && src.toLowerCase().indexOf('cesium-navigation') > 0) {
            var result = startupScriptRegex.exec(src);
            if (result !== null) {
                return result[1];
            }
        }
    }
    return undefined;
}
;
debugger;
var baseTerriaNavigationUrl = '';
if (typeof window !== 'undefined') {
    baseTerriaNavigationUrl = getBaseTerriaNavigationUrl();
}
requirejs.config({
    baseUrl: baseTerriaNavigationUrl,
    paths: {
        'Knockout': 'lib/ThirdParty/knockout-3.3.0',
        'knockoutes5': 'lib/ThirdParty/knockout-es5.min',
        'Hammer': 'lib/ThirdParty/hammerjs',
        'sanitizeCaja': 'lib/ThirdParty/sanitizer-bundle',
        'MarkdownIt': 'lib/ThirdParty/markdown-it.min',
        'navigatorTemplate': 'lib/Views/Navigation.html',
        'distanceLegendTemplate': 'lib/Views/DistanceLegend.html',
        'DistanceLegendViewModel': 'lib/ViewModels/DistanceLegendViewModel',
        'createFragmentFromTemplate': 'lib/Core/createFragmentFromTemplate',
        'loadView': 'lib/Core/loadView',
        'inherit': 'lib/Core/inherit',
        'svgReset': 'lib/SvgPaths/svgReset',
        'UserInterfaceControl': 'lib/ViewModels/UserInterfaceControl',
        'NavigationControl': 'lib/ViewModels/NavigationControl',
        'ResetViewNavigationControl': 'lib/ViewModels/ResetViewNavigationControl',
        'ZoomInNavigationControl': 'lib/ViewModels/ZoomInNavigationControl',
        'ZoomOutNavigationControl': 'lib/ViewModels/ZoomOutNavigationControl',
        'svgCompassOuterRing': 'lib/SvgPaths/svgCompassOuterRing',
        'svgCompassGyro': 'lib/SvgPaths/svgCompassGyro',
        'svgCompassRotationMarker': 'lib/SvgPaths/svgCompassRotationMarker',
        'KnockoutMarkdownBinding': 'lib/Core/KnockoutMarkdownBinding',
        'KnockoutHammerBinding': 'lib/Core/KnockoutHammerBinding',
        'registerKnockoutBindings': 'lib/Core/registerKnockoutBindings',
        'NavigationViewModel': 'lib/ViewModels/NavigationViewModel',
        'Navigation': 'Navigation',
        'CameraView': 'lib/Models/CameraView'
    }
});
function navigationInitialization(cesiumContainerId, viewer) {
    require(['Navigation'], function (navigation) {
        navigation.initialize(document.getElementById(cesiumContainerId), viewer);
        viewer.navigation = navigation;
    });
}
;
define('NavigationStartup', ['Navigation'], function () {
    return;
});