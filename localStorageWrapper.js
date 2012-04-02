/*
	Copyright (C) 2012 Will Honey

	Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.



	A simple localStorage Wrapper. Supports objects and strings. Care should be taken for extreme cases.

	Usage:
		var localStorageData = new localStorageWrapper("name");
			localStorageData.set(data);
			localStorageData.get() --> data;
			localStorageData.del() --> removal from localStorage;
*/

function localStorageWrapper (key) {
	this.key = key;
}
localStorageWrapper.prototype.get = function () {
	if (!localStorage[this.key]) {
		return;
	}

	try {
		return JSON.parse(localStorage[this.key]);
	} catch(e) {
		 return localStorage[this.key];
	}

}
localStorageWrapper.prototype.set = function (value) {
	try {
		localStorage[this.key] = (typeof value === "string") ? value : JSON.stringify(value);
	} catch (e){
		console.error("Error Saving to localStorage");
	}
},
localStorageWrapper.prototype.del = function () {
	delete localStorage[this.key];
}