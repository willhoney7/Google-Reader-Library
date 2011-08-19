/*
	This library was developed by Will Honey.
	It is licensed under the GPLv3 Open Source License

	This library requires the underscore library found at http://documentcloud.github.com/underscore/ 
	This library requires the underscore string library found at http://edtsech.github.com/underscore.string/
	This library requires the support of localStorage. Updates could be easily made to change that
*/

/* jslint adsafe: false, devel: true, regexp: true, browser: true, vars: true, nomen: true, maxerr: 50, indent: 4 */
/* global localStorage, window, reader, _ */

(function () {
	"use strict";

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
	reader.is_logged_in = false;
	reader.is_initialized = false;
	reader.has_loaded_prefs = false;

	//constants that will only be used in this file 
	var CLIENT = "Tibfib",
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

	//managing the logged in user
	reader.setUser =  function (user) {
		localStorage.User = JSON.stringify(user);
	};
	reader.getUser = function () {
		return JSON.parse(localStorage.User);
	};

	//managing the app authentication
	var readerAuth = "",
		readerToken = "";
	reader.getAuth = function () {
		if (readerAuth !== "undefined") {
			return readerAuth;		
		}
	};
	reader.setAuth = function (auth) {
		readerAuth = auth;	
	};

	//the core ajax function
	var requests = [],
		makeRequest = function (obj, noAuth) {
			//make sure we have a method
			if (!obj.method) {
				obj.method = "GET";
			}
			//make sure we have a parameters object
			if (!obj.parameters) {
				obj.parameters = {};
			}

			//add the necessary parameters to get our requests to function properly
			if (obj.method === "GET") {
				obj.parameters.ck = Date.now() || new Date().getTime();
				obj.parameters.accountType = "GOOGLE";
				obj.parameters.service = "reader";
				obj.parameters.output = "json";	
				obj.parameters.client = CLIENT;
			}

			//if we have a token, add it to the parameters
			if (readerToken) {
				if (obj.method === "POST") {
					//it seems that "GET" requests don't care about your token
					obj.parameters.T = readerToken;			
				}
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

			if (reader.getAuth() && !noAuth) {
				//this one is important. This is how google does authorization.
				request.setRequestHeader("Authorization", "GoogleLogin auth=" + reader.getAuth());
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

	reader.load = function () {
		reader.is_logged_in = false;
		reader.is_initialized = true;
		
		//check storage for the tokens we need.
		if (localStorage.Auth && localStorage.Auth !== "undefined") {
			reader.setAuth(localStorage.Auth);
			reader.is_logged_in = true;
		} 
		return (reader.is_logged_in);

	};

	reader.login = function (email, password, successCallback, failCallback) {
		if (email.length === 0 || password.length === 0) {
			failCallback("Blank Info...");
		}
		makeRequest({
			method: "GET",
			url: LOGIN_URL,
			parameters: {
				Email: email,
				Passwd: password
			},
			onSuccess: function (transport) {
				localStorage.Auth = _(transport.responseText).lines()[2].replace("Auth=", "");
				
				reader.load();

				getUserInfo(successCallback);
	
			},
			onFailure: function (transport) {
				console.error(transport);
				failCallback(reader.normalizeError(transport.responseText));
			}
		});
	};

	reader.logout = function () {
		reader.is_logged_in = false;
		localStorage.Auth = undefined;
		reader.setUser({});
		reader.setAuth("");
		reader.setFeeds([]);
	};

	var getUserInfo = function (successCallback, failCallback) {
		makeRequest({
			method: "GET",
			url: BASE_URL + USERINFO_SUFFIX,
			parameters: {},
			onSuccess: function (transport) {
				reader.setUser(JSON.parse(transport.responseText));

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

	//Get the token
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

	// *************************************
	// *
	// *	Loading Feeds
	// *
	// *************************************

	//Get the user's subscribed feeds
	reader.loadFeeds = function (successCallback) {
		function loadFeeds() {
			makeRequest({
				method: "GET",
				url: BASE_URL + SUBSCRIPTIONS_PATH + LIST_SUFFIX,
				onSuccess: function (transport) {
					//save feeds in an organized state.

					loadTags(function (tags) {
						//get unread counts
						reader.getUnreadCounts(function (unreadcounts) {

							//organize and save feeds
							reader.setFeeds(
								organizeFeeds(
									JSON.parse(transport.responseText).subscriptions, 
									tags, 
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

	var loadTags = function (successCallback) {
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

	//organizes feeds based on categories/labels.
	//this function is ridiculous. like really, holy crap.
	var organizeFeeds = function (subscriptions, tags, unreadCounts, userPrefs) {
		var uncategorized = [];

		//prepare tags
		tags.unshift({title: "All", id: reader.TAGS["reading-list"], feeds: subscriptions, isAll: true, isSpecial: true});
		tags.pop(); //remove "user/-/state/com.blogger/blogger-following". not exactly future friendly *shrug*
		
		var tagTitleRegExp = /[^\/]+$/i;
		_(tags).each(function (tag) {
		
			//give tags a .title
			if (!tag.title) {
				tag.title = tagTitleRegExp.exec(tag.id)[0];	
			}

			//based on title add unique properties
			if (tag.title === "starred") {
				tag.title = _(tag.title).capitalize();
				tag.isSpecial = true;
			} else if (tag.title === "broadcast") {
				tag.title = "Shared";
				tag.isSpecial = true;
			} else if (!tag.isSpecial) {
				tag.isLabel = true;
			}

			tag.feeds = [];
		
			//remove digits from the id
			tag.id = reader.correctId(tag.id);

			//apply unreadCounts
			_(unreadCounts).each(function (unreadCount) {
				unreadCount.id = reader.correctId(unreadCount.id);

				if (tag.id === unreadCount.id) {
					tag.count = unreadCount.count;
					tag.newestItemTimestamp = unreadCount.newestItemTimestampUsec;	
				}
			});
		});

		//process subscriptions
		_(subscriptions).each(function (sub) {
			//give isFeed property, useful for identifying
			sub.isFeed = true;

			//replace digits from the id
			sub.id = reader.correctId(sub.id);

			//apply unread counts
			_(unreadCounts).each(function (unreadCount) {
				if (sub.id === unreadCount.id) {
					sub.count = unreadCount.count;
					sub.newestItemTimestamp = unreadCount.newestItemTimestampUsec;	
				}
			});

			if (sub.categories.length === 0) {
				//if the subscription has no categories, push it onto the uncategorized array
				uncategorized.push(sub);
			} else {
				//otherwise find the category from the tags array and push the sub into its feeds array
				_(sub.categories).each(function (tag) {
					tag.id = reader.correctId(tag.id);
					_(tags).each(function (fullTag) {
						if (tag.id === fullTag.id) {
							var sub_clone = _(sub).clone();
								sub_clone.inside = fullTag.id;

							fullTag.feeds.push(sub_clone);
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

		//remove tags with no feeds
		var tagsWithFeeds = _(tags).reject(function (tag) {
			return (tag.feeds.length === 0 && !tag.isSpecial);
		});

		//order the feeds within tags
		_(tagsWithFeeds).each(function (tag) {
			//get the ordering id based on the userPrefs
			var orderingId = _(userPrefs[tag.id]).detect(function (setting) {
				return (setting.id === "subscription-ordering");
			});
			if (orderingId) {
				tag.feeds = _(tag.feeds).sortBy(function (feed) {
					if (orderingId.value.indexOf(feed.sortid) === -1) {
						//if our sortid isn't there, the feed should be at the back.
						return 1000;
					}
					//return the index of our feed sortid, which will be in multiples of 8 since sortid's are 8 characters long.
					return (orderingId.value.indexOf(feed.sortid)) / 8;
				});	
			}	//there might be another setting we should follow like "alphabetical" or "most recent". Just a guess. 
			/*else {
				tag.feeds.sort();
			}*/
			
		});

		//now order ALL feeds and tags
		var orderingId = _(userPrefs["user/-/state/com.google/root"]).detect(function (setting) {
			return (setting.id === "subscription-ordering");
		}) || {value: ""};
		

		//our feeds are our tagsWithFeeds + our uncategorized subscriptions
		var feeds = [].concat(tagsWithFeeds, uncategorized);
			//sort them by sortid
			feeds = _(feeds).sortBy(function (feed) {
				if (orderingId.value.indexOf(feed.sortid) === -1 && !feed.isSpecial) {
					return 1000;
				}
				return (orderingId.value.indexOf(feed.sortid)) / 8;
			});

		return feeds;
	};

	//get unread counts from google reader
	//passing true as the second arg gets you an object, extremely useful for notifications
	reader.getUnreadCounts = function (successCallback, returnObject) {
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

	reader.markAllAsRead = function (feedOrLabelId, successCallback) {
		//feed or label
		makeRequest({
			method: "POST",
			url: BASE_URL + MARK_ALL_READ_SUFFIX,
			parameters: {
				s: feedOrLabelId
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
	// *	Adding a Feed
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

	var urlRegex = /(http|ftp|https):\/\/[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?\^=%&amp;:\/~\+#]*[\w\-\@?\^=%&amp;\/~\+#])?/;
	reader.processFeedInput = function (input, inputType, successCallback, failCallback) {
		var url = "https://ajax.googleapis.com/ajax/services/feed/";
		if ((reader.urlRegex.test(input) || inputType === "url") && inputType !== "keyword") {
			url += "load";
		} else {
			url += "find";
			//replace the .com, or .net from the input, since our search doesn't like that
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

	reader.setItemTag = function (feed, item, tag, add, successCallback) {
		//feed/label id
		//item id
		//tag in simple form: "like", "read", "share", "label", "star", "kept-unread"
		//add === true, or add === false

		var params = {
			s: feed,
			i: item,
			async: "true",
			ac: "edit-tags"
		};
		if (add === true) {
			params.a = reader.TAGS[tag];
		} else {
			params.r = reader.TAGS[tag];
		}
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
	
	//returns url for image to use in the icon
	reader.getIconForFeed = function (feedUrl) {
		return "http://www.google.com/s2/favicons?domain_url=" + encodeURIComponent(feedUrl);
	};

	//normalizes error response for logging in
	reader.normalizeError = function (inErrorResponse) {
		return _(inErrorResponse).lines()[0].replace("Error=", "").replace(/(\w)([A-Z])/g, "$1 $2");
	};

}());