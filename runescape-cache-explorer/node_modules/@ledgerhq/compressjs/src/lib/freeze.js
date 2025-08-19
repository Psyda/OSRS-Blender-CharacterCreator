'use strict';

// Object.freeze(), or a thunk if that method is not present in this
// JavaScript environment.

if (Object.freeze) {
    module.exports = Object.freeze;
} else {
    module.exports = function(o) { return o; };
}
