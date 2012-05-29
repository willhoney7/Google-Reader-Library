/*
	Copyright (C) 2012 Will Honey

	Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


	v1.0 - working

	This library requires the underscore library found at http://documentcloud.github.com/underscore/ 
	This library requires the underscore string library found at http://edtsech.github.com/underscore.string/
	This library requires the support of a localStorage Wrapper I made, however updates could be easily made to change that.

	On Terminology: the API is a little confusing on what it calls things so I made it simple for myself and have set these definitions.
		SUBSCRIPTION - either a label or a feed subscription
		FEED - an individual site's rss feed
		LABEL - a folder/label/category that contains feeds.
		TAGS - the states applied to individual items (read, starred, etc.)
		ITEM - an individual article

*/

/* jslint adsafe: false, devel: true, regexp: true, browser: true, vars: true, nomen: true, maxerr: 50, indent: 4 */
/* global localStorage, window, reader, _ */

(function () {
	"use strict";

	//we need the underscore string lib
	_.mixin(_.string.exports());

	window.reader = {};
	
	//global constants that will likely be used outside of this file
	reader.TAGS = {
		"like": "user/-/state/com.google/like",
		"label": "user/-/label/",
		"star": "user/-/state/com.google/starred",
		"read": "user/-/state/com.google/read",
		"fresh": "user/-/state/com.google/fresh",
		"share": "user/-/state/com.google/broadcast",
		"kept-unread": "user/-/state/com.google/kept-unread",
		"reading-list": "user/-/state/com.google/reading-list"
	};
	//global variables
	reader.has_loaded_prefs = false;

	//constants that will only be used in this file 
	var CLIENT = "Tibfib", //put your own string here
		//base urls
		LOGIN_URL = "https://www.google.com/accounts/ClientLogin", 
		BASE_URL = "http://www.google.com/reader/api/0/",
		//url paths
		PREFERENCES_PATH = "preference/stream/list",
		STREAM_PATH = "stream/contents/",
		SUBSCRIPTIONS_PATH = "subscription/",
		LABEL_PATH = "user/-/label/",
		TAGS_PATH = "tag/",
		//url actions
		LIST_SUFFIX = "list",
		EDIT_SUFFIX = "edit",
		MARK_ALL_READ_SUFFIX = "mark-all-as-read",
		TOKEN_SUFFIX = "token",
		USERINFO_SUFFIX = "user-info",
		UNREAD_SUFFIX = "unread-count",
		RENAME_LABEL_SUFFIX = "rename-tag",
		EDIT_TAG_SUFFIX = "edit-tag";

	//managing the feeds
	var readerFeeds = [];
	reader.setFeeds =  function (feeds) {
		readerFeeds = feeds;	
	};
	reader.getFeeds = function () {
		return readerFeeds;
	};
	reader.getLabels = function () {
		return _(reader.getFeeds()).select(function (feed) { return feed.isLabel; });
	};

	var readerUser = new localStorageWrapper("User"),
		readerAuth = new localStorageWrapper("Auth");

	//the core ajax function, you won't need to use this directly
	var readerToken = "",
		requests = [],
		makeRequest = function (obj, noAuth) {
			//make sure we have a method and a parameters object
			obj.method = obj.method || "GET";
			obj.parameters = obj.parameters || {};

			//add the necessary parameters to get our requests to function properly
			if (obj.method === "GET") {
				obj.parameters.ck = Date.now() || new Date().getTime();
				obj.parameters.accountType = "GOOGLE";
				obj.parameters.service = "reader";
				obj.parameters.output = "json";	
				obj.parameters.client = CLIENT;
			}

			//if we have a token, add it to the parameters
			if (readerToken && obj.method === "POST") {
				//it seems that "GET" requests don't care about your token
				obj.parameters.T = readerToken;			
			}
			
			//turn our parameters object into a query string
			var queries = [], 
				key, 
				queryString;

			for (key in obj.parameters) {
				if (obj.parameters.hasOwnProperty(key)) {
					queries.push(encodeURIComponent(key) + "=" + encodeURIComponent(obj.parameters[key]));				
				}
			}
			queryString = queries.join("&");
			
			//for get requests, attach the queryString
			//for post requests, attach just the client constant
			var url = (obj.method === "GET") ? (obj.url + "?" + queryString) : (obj.url + "?" + encodeURIComponent("client") + "=" + encodeURIComponent(CLIENT));
				
			var request = new XMLHttpRequest();
			request.open(obj.method, url, true);

			//set request header
			request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

			if (readerAuth.get() && !noAuth) {
				//this one is important. This is how google does authorization.
				request.setRequestHeader("Authorization", "GoogleLogin auth=" + readerAuth.get());
			}

			var requestIndex = requests.length;
			request.onreadystatechange = function () {
				if ((request.readyState === 4) && request.status === 200) {
					if (obj.onSuccess) {
						obj.onSuccess(request);
						if (requests[requestIndex]) {
							delete requests[requestIndex];
						}
					}
				} else if (request.readyState === 4) {
					if (obj.method === "POST") {
						if (!obj.tried) {
							//If it failed and this is a post request, try getting a new token, then do the request again
							reader.getToken(function () {
								obj.tried = true;
								makeRequest(obj);
								if (requests[requestIndex]) {
									delete requests[requestIndex];
								}
							}, obj.onFailure);
						}
					} else {
						if (obj.onFailure) {
							obj.onFailure(request);
							if (requests[requestIndex]) {
								delete requests[requestIndex];
							}
						}
					}
					if (request.status === 401 && request.statusText === "Unauthorized") {
						//Humane is a notification lib. 
						if (humane) {
							humane(request.statusText + ". " + "Try logging in again.");
						} else {
							console.error("AUTH EXPIRED? TRY LOGGING IN AGAIN");
						}
					}

					console.error(request);
				}
			};

			request.send((obj.method === "POST") ? queryString : "");
			requests.push(request);
		};

	// *************************************
	// *
	// *	Authentication
	// *
	// *************************************

	//your first order of business will be to check for the auth header.
	//if it does you should check for the token
	//if it does not, you should prompt the user for their login credentials
	reader.hasAuth = function(){
		if(readerAuth.get()){
			return true;
		}
	};

	//login with the user's provided info.
	//this saves our auth header to localStorage. This can be reused across sessions.
	reader.login = function (email, password, successCallback, failCallback) {
		if (email.length === 0 || password.length === 0) {
			failCallback("Blank Info...");
			return;
		}
		makeRequest({
			method: "GET",
			url: LOGIN_URL,
			parameters: {
				Email: email,
				Passwd: password
			},
			onSuccess: function (transport) {
				//this is what authorizes every action the user takes
				readerAuth.set(_.lines(transport.responseText)[2].replace("Auth=", ""));
				
				//reader.load();

				reader.getUserInfo(successCallback, failCallback);
	
			},
			onFailure: function (transport) {
				console.error(transport);
				failCallback(reader.normalizeError(transport.responseText));
			}
		});
	};

	//Every session you need to request this token after you have the auth header
	//If it fails, your auth header has expired and you need to have the user login again.
	reader.getToken = function (successCallback, failCallback) {
		makeRequest({
			method: "GET",
			url: BASE_URL + TOKEN_SUFFIX,
			parameters: {},
			onSuccess: function (transport) {
				readerToken = transport.responseText;
				successCallback();
				
			}, 
			onFailure: function (transport) {
				console.error("failed", transport);
				if (failCallback) {
					failCallback(reader.normalizeError(transport.responseText));
				}
			}
		});
	};

	//logout the user
	reader.logout = function () {
		
		//delete localStorage.Auth;
		readerAuth.del();
		readerUser.del();

		//delete localStorage.User;
		//reader.setUser({});

		reader.setFeeds([]);
	};

	//get the user info, an object of data
	reader.getUserInfo = function (successCallback, failCallback) {
		makeRequest({
			method: "GET",
			url: BASE_URL + USERINFO_SUFFIX,
			parameters: {},
			onSuccess: function (transport) {
				readerUser.set(JSON.parse(transport.responseText));
				//reader.setUser(JSON.parse(transport.responseText));

				successCallback();
			},
			onFailure: function (transport) {
				console.error(transport);
				if (failCallback) {
					failCallback(reader.normalizeError(transport.responseText));
					
				}
			}
		});			
	};

	var getUserPreferences = function (successCallback, failCallback) {
		makeRequest({
			method: "GET",
			url: BASE_URL + PREFERENCES_PATH,
			parameters: {},
			onSuccess: function (transport) {
				reader.has_loaded_prefs = true;
				reader.userPrefs = JSON.parse(transport.responseText).streamprefs;
				if (successCallback) {
					successCallback();				
				}
			},
			onFailure: function (transport) {
				console.error(transport);
				if (failCallback) {
					failCallback(reader.normalizeError(transport.responseText));
					
				}
			}
		});		
	};


	// *************************************
	// *
	// *	Loading Feeds
	// *
	// *************************************

	//Get the user's subscribed feeds, organizes them in a nice little array.
	reader.loadFeeds = function (successCallback) {
		function loadFeeds() {
			makeRequest({
				method: "GET",
				url: BASE_URL + SUBSCRIPTIONS_PATH + LIST_SUFFIX,
				onSuccess: function (transport) {
					//save feeds in an organized state.

					loadLabels(function (labels) {
						//get unread counts
						reader.getUnreadCounts(function (unreadcounts) {

							//organize and save feeds
							reader.setFeeds(
								organizeFeeds(
									JSON.parse(transport.responseText).subscriptions, 
									labels, 
									unreadcounts,
									reader.userPrefs
								)
							);

							//callback with our feeds
							successCallback(reader.getFeeds());
						});	

					});
					
				},
				onFailure: function (transport) {
					console.error(transport);
				}
			});	
		}
		if (reader.has_loaded_prefs) {
			loadFeeds();
		} else {
			getUserPreferences(loadFeeds);
		}
	};

	var loadLabels = function (successCallback) {
		makeRequest({
			method: "GET",
			url: BASE_URL + TAGS_PATH + LIST_SUFFIX,
			onSuccess: function (transport) {
				//save feeds in an organized state.
				successCallback(JSON.parse(transport.responseText).tags);
			},
			onFailure: function (transport) {
				console.error(transport);
			}
		});	
	
	};

	//organizes feeds based on labels.
	var organizeFeeds = function (feeds, labels, unreadCounts, userPrefs) {
		var unlabeled = [];

		//prepare labels
		labels.unshift({title: "All", id: reader.TAGS["reading-list"], feeds: feeds, isAll: true, isSpecial: true});
		labels.pop(); //remove "user/-/state/com.blogger/blogger-following". not exactly future friendly *shrug*
		
		var labelTitleRegExp = /[^\/]+$/i;
		_(labels).each(function (label) {
			
			label.title = label.title || labelTitleRegExp.exec(label.id)[0];

			//based on title add unique properties
			if (label.title === "starred") {
				label.title = _(label.title).capitalize();
				label.isSpecial = true;
			} else if (label.title === "broadcast") {
				label.title = "Shared";
				label.isSpecial = true;
			} else if (!label.isSpecial) {
				label.isLabel = true;
			}

			label.feeds = [];
		
			//remove digits from the id
			label.id = reader.correctId(label.id);

			//apply unreadCounts
			_(unreadCounts).each(function (unreadCount) {
				unreadCount.id = reader.correctId(unreadCount.id);

				if (label.id === unreadCount.id) {
					label.count = unreadCount.count;
					label.newestItemTimestamp = unreadCount.newestItemTimestampUsec;	
				}
			});
		});

		//process feeds
		_(feeds).each(function (feed) {
			//give isFeed property, useful for identifying
			feed.isFeed = true;

			//replace digits from the id
			feed.id = reader.correctId(feed.id);

			//apply unread counts
			_(unreadCounts).each(function (unreadCount) {
				if (feed.id === unreadCount.id) {
					feed.count = unreadCount.count;
					feed.newestItemTimestamp = unreadCount.newestItemTimestampUsec;	
				}
			});

			if (feed.categories.length === 0) {
				//if the feed has no labels, push it onto the unlabeled array
				unlabeled.push(feed);
			} else {
				//otherwise find the label from the labels array and push the feed into its feeds array
				_(feed.categories).each(function (label) {
					label.id = reader.correctId(label.id);
					_(labels).each(function (fullLabel) {
						if (label.id === fullLabel.id) {
							var feed_clone = _(feed).clone();
								feed_clone.inside = fullLabel.id;

							fullLabel.feeds.push(feed_clone);
						}
					});
				});
			}

		});

		//replace digits
		_(userPrefs).each(function (value, key) {
			if (/user\/\d*\//.test(key)) {
				userPrefs[reader.correctId(key)] = value;
			}
		});

		//remove labels with no feeds
		var labelsWithFeeds = _(labels).reject(function (label) {
			return (label.feeds.length === 0 && !label.isSpecial);
		});

		//order the feeds within labels
		_(labelsWithFeeds).each(function (label) {
			//get the ordering id based on the userPrefs
			var orderingId = _(userPrefs[label.id]).detect(function (setting) {
				return (setting.id === "subscription-ordering");
			});
			if (orderingId) {
				label.feeds = _(label.feeds).sortBy(function (feed) {
					if (orderingId.value.indexOf(feed.sortid) === -1) {
						//if our sortid isn't there, the feed should be at the back.
						return 1000;
					}
					//return the index of our feed sortid, which will be in multiples of 8 since sortid's are 8 characters long.
					return (orderingId.value.indexOf(feed.sortid)) / 8;
				});	
			}	//there might be another setting we should follow like "alphabetical" or "most recent". Just a guess. 
			/*else {
				labels.feeds.sort();
			}*/
			
		});

		//now order ALL feeds and labels
		var orderingId = _(userPrefs["user/-/state/com.google/root"]).detect(function (setting) {
			return (setting.id === "subscription-ordering");
		}) || {value: ""};
		

		//our subscriptions are our labelsWithFeeds + our unlabeled feeds
		var subscriptions = [].concat(labelsWithFeeds, unlabeled);
			//sort them by sortid
			subscriptions = _(subscriptions).sortBy(function (subscription) {
				if (orderingId.value.indexOf(subscription.sortid) === -1 && !subscription.isSpecial) {
					return 1000;
				}
				return (orderingId.value.indexOf(subscription.sortid)) / 8;
			});

		return subscriptions;
	};

	//get unread counts from google reader
	reader.getUnreadCounts = function (successCallback, returnObject) {
		//passing true for returnObject gets you an object useful for notifications
		makeRequest({
			url: BASE_URL + UNREAD_SUFFIX,
			onSuccess: function (transport) {
				var unreadCounts = JSON.parse(transport.responseText).unreadcounts;
				//console.log(transport);
				var unreadCountsObj = {};
				_(unreadCounts).each(function (obj) {
					unreadCountsObj[reader.correctId(obj.id)] = obj.count;
				});
				reader.unreadCountsObj = unreadCountsObj;

				if (returnObject) {
					successCallback(unreadCountsObj);	
				} else {
					successCallback(unreadCounts);
				}
				
			}, 
			onFailure: function (transport) {
				console.error(transport);
			}		
		});
	};

	//this is a function so we can reduce the amount of ajax calls when setting an article as read. Just manually decrement the counts, don't request new numbers.
	reader.decrementUnreadCount = function (feedId, callback) {
		_.each(reader.getFeeds(), function (subscription) {
			if (subscription.id === feedId || (subscription.isAll)) {
				subscription.count -= 1;
			} else if (subscription.feeds && subscription.feeds.length > 0) {
				_.each(subscription.feeds, function (feed) {
					if (feed.id === feedId) {
						subscription.count -= 1;
					}
				});
			}
		});
		callback();
	};

	// *************************************
	// *
	// *	Editing Feeds
	// *
	// *************************************

	var editFeed = function (params, successCallback) {
		if (!params) {
			console.error("No params for feed edit");
			return;
		}
		
		makeRequest({
			method: "POST",
			url: BASE_URL + SUBSCRIPTIONS_PATH + EDIT_SUFFIX,
			parameters: params,
			onSuccess: function (transport) {
				successCallback(transport.responseText);
			}, 
			onFailure: function (transport) {
				console.error(transport);
			}
		});
	};

	//edit feed title
	reader.editFeedTitle = function (feedId, newTitle, successCallback) {
		editFeed({
			ac: "edit",
			t: newTitle,
			s: feedId
		}, successCallback);
	};
	reader.editFeedLabel = function (feedId, label, opt, successCallback) {
		var obj = {
			ac: "edit",
			s: feedId
		};
		if (opt) {
			obj.a = label;
		} else {
			obj.r = label;
		}
		editFeed(obj, successCallback);
	};

	reader.editLabelTitle = function (labelId, newTitle, successCallback) {
		makeRequest({
			method: "POST",
			url: BASE_URL + RENAME_LABEL_SUFFIX,
			parameters: {
				s: LABEL_PATH + labelId,
				t: labelId,
				dest: LABEL_PATH + newTitle
			},
			onSuccess: function (transport) {
				successCallback(transport.responseText);
			}, 
			onFailure: function (transport) {
				console.error(transport);
			}

		});
	};

	reader.markAllAsRead = function (subscriptionId, successCallback) {
		//feed or label
		makeRequest({
			method: "POST",
			url: BASE_URL + MARK_ALL_READ_SUFFIX,
			parameters: {
				s: subscriptionId
			},
			onSuccess: function (transport) {
				successCallback(transport.responseText);
			}, 
			onFailure: function (transport) {
				console.error(transport);
			}

		});
	};

	// *************************************
	// *
	// *	Adding/Removing Feeds
	// *
	// *************************************
	
	reader.unsubscribeFeed = function (feedId, successCallback) {
		editFeed({
			ac: "unsubscribe",
			s: feedId
		}, successCallback);
	};

	reader.subscribeFeed = function (feedUrl, successCallback, title) {
		editFeed({
			ac: "subscribe",
			s: "feed/" + feedUrl,
			t: title || undefined
		}, successCallback);
	};

	// This function searches Google's feed API to find RSS feeds.
	var readerUrlRegex = /(http|ftp|https):\/\/[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?\^=%&amp;:\/~\+#]*[\w\-\@?\^=%&amp;\/~\+#])?/;
	reader.processFeedInput = function (input, inputType, successCallback, failCallback) {
		var url = "https://ajax.googleapis.com/ajax/services/feed/";
		if ((readerUrlRegex.test(input) || inputType === "url") && inputType !== "keyword") {
			url += "load";
		} else {
			url += "find";
			//remove the TLD from the input, since our search doesn't like that
			input = input.replace(/\.\w{1,3}\.*\w{0,2}$/ig, "");
		}
		makeRequest({
			url: url,
			parameters: {
				q: encodeURI(input),
				v: "1.0"				
			},
			onSuccess: function (transport) {
				var response = JSON.parse(transport.responseText);
				if (response.responseStatus === 200) {
					if (response.responseData.entries) {
						successCallback(response.responseData.entries, "keyword");
					} else {
						successCallback(response.responseData.feed, "url");
					}
				} else {
					failCallback(response.responseDetails);
				}

			}, 
			onFailure: function (transport) {
				console.error(transport);
			}			
		}, true);
	};

	// *************************************
	// *
	// *	Loading Items
	// *
	// *************************************

	reader.getItems = function (feedUrl, successCallback, opts) {
		var params = opts || {n: 50};
			params.r = "d";
			
		makeRequest({
			method: "GET",
			url: BASE_URL + STREAM_PATH + encodeURIComponent(feedUrl),
			parameters: params, /*{
				//ot=[unix timestamp] : The time from which you want to retrieve items. Only items that have been crawled by Google Reader after this time will be returned.
				//r=[d|n|o] : Sort order of item results. d or n gives items in descending date order, o in ascending order.
				//xt=[exclude target] : Used to exclude certain items from the feed. For example, using xt=user/-/state/com.google/read will exclude items that the current user has marked as read, or xt=feed/[feedurl] will exclude items from a particular feed (obviously not useful in this request, but xt appears in other listing requests).
			},*/
			onSuccess: function (transport) {
				successCallback(JSON.parse(transport.responseText).items);
			}, 
			onFailure: function (transport) {
				console.error(transport);
			}
		});
	};

	// *************************************
	// *
	// *	Editing Items
	// *
	// *************************************

	reader.setItemTag = function (subscriptionId, itemId, tag, add, successCallback) {
		//subscription id
		//item id
		//tag in simple form: "like", "read", "share", "label", "star", "kept-unread"
		//add === true, or add === false

		var params = {
			s: subscriptionId,
			i: itemId,
			async: "true",
			ac: "edit-tags",
			//add the tag if specified or remove it...
			a: (add) ? reader.TAGS[tag] : undefined,
			r: (!add) ? reader.TAGS[tag] : undefined
		};

		makeRequest({
			method: "POST",
			url: BASE_URL + EDIT_TAG_SUFFIX,
			parameters: params,
			onSuccess: function (transport) {
				if (transport.responseText === "OK") {
					successCallback(transport.responseText);	
				}
			}, 
			onFailure: function (transport) {
				console.error(transport);
			} 
		});
	};

	// *************************************
	// *
	// *	Useful Utilities
	// *
	// *************************************
	
	
	//this function replaces the number id with a dash. Helpful for comparison
	var readerIdRegExp = /user\/\d*\//;
	reader.correctId = function (id) {
		return id.replace(readerIdRegExp, "user\/-\/");
	};

	reader.isRead = function (article) {
		if(article.read !== undefined){
			return article.read;
		}
		for (var i = 0; i < article.categories.length; i++) {
			if(reader.correctId(article.categories[i]) === reader.TAGS['read']){
				return true;
			}
		};
		
		return false;
	};
	
	//returns url for image to use in the icon
	reader.getIconForFeed = function (feedUrl) {
		return "http://www.google.com/s2/favicons?domain_url=" + encodeURIComponent(feedUrl);
	};

	//normalizes error response for logging in
	reader.normalizeError = function (inErrorResponse) {
		var errorMessage = _(inErrorResponse).lines()[0].replace("Error=", "").replace(/(\w)([A-Z])/g, "$1 $2");
		errorMessage = (errorMessage === "Bad Authentication") ? "Incorrect Email/Password" : errorMessage;
		return errorMessage;
	};

}());