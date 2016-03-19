# markdown-it-sanitizer

[![Build Status](https://img.shields.io/travis/svbergerem/markdown-it-sanitizer/master.svg?style=flat)](https://travis-ci.org/svbergerem/markdown-it-sanitizer)
[![Coverage Status](https://img.shields.io/coveralls/svbergerem/markdown-it-sanitizer/master.svg?style=flat)](https://coveralls.io/r/svbergerem/markdown-it-sanitizer?branch=master)
[![npm version](https://img.shields.io/npm/v/markdown-it-sanitizer.svg?style=flat)](https://npmjs.com/package/markdown-it-sanitizer)

> sanitizer plugin for [markdown-it](https://github.com/markdown-it/markdown-it) markdown parser.

## Accepted tags

All tags are parsed case insensitive.

### Balanced
`<b>`, `<blockquote>`, `<code>`, `<em>`, `<h1>`, ..., `<h6>`, `<li>`, `<ol>`, `<ol start="42">`, `<p>`, `<pre>`, `<sub>`, `<sup>`, `<strong>`, `<strike>`, `<ul>`

### Standalone
`<br>`, `<hr>`

### Links
`<a href="http://example.com" title="link">text</a>`

The `title` attribute is optional.

### Images
`<img src="http://example.com" alt="cat" title="image">`

The `alt` and `title` attributes are optional.

## Install

node.js, bower:

```bash
npm install markdown-it-sanitizer --save
bower install markdown-it-sanitizer --save
```

## Use

#### Basic

```js
var md = require('markdown-it')({ html: true })
            .use(require('markdown-it-sanitizer'));

md.render('<b>test<p></b>'); // => '<p><b>test</b></p>'
```

#### Advanced

For not whitelisted tags and tags that don't have a matching opening/closing tag you can define whether you would like to remove or escape them. You can also define a class attribute that will be added to image tags. Here is an example with default values:

```js
var md = require('markdown-it')({ html: true })
            .use(require('markdown-it-sanitizer'), {
              imageClass: '',
              removeUnbalanced: false,
              removeUnknown: false
            });

// unknown tag
md.render('<u>test</u>'); // => '<p>&lt;u&gt;test&lt;/u&gt;</p>'
// unknown tag with removeUnknown: true
md.render('<u>test</u>'); // => '<p>test</p>'

// unbalanced tags
md.render('<b>test</em>'); // => '<p>&lt;b&gt;test&lt;/em&gt;</p>'
// unbalanced tags with removeUnbalanced: true
md.render('<b>test</em>'); // => '<p>test</p>'

// imageClass: 'img-responsive'
md.render('<img src="http://example.com/image.png" alt="image" title="example">'); // => '<p><img src="http://example.com/image.png" alt="image" title="example" class="img-responsive"></p>'

```

_Differences in the browser._ If you load the script directly into the page, without
package system, the module will add itself globally as `window.markdownitSanitizer`.

## License

[MIT](https://github.com/svbergerem/markdown-it-sanitizer/blob/master/LICENSE)
