/*
	This library was developed by Will Honey.
	It is licensed under the GPLv3 Open Source License

	This library requires the underscore library found at http://documentcloud.github.com/underscore/ 
	This library requires the underscore string library found at http://edtsech.github.com/underscore.string/
	This library required the support of localStorage. Updates could be easily made to change that
*/

reader = {
	/*constants*/
	CLIENT: "Tibfib",

	//urls
	LOGIN_URL: "https://www.google.com/accounts/ClientLogin",
	BASE_URL: "http://www.google.com/reader/api/0/",

	PREFERENCES_PATH: "preference/stream/list",
	STREAM_PATH: "stream/contents/",
	SUBSCRIPTIONS_PATH: "subscription/",
	LABEL_PATH: "user/-/label/",
	TAGS_PATH: "tag/",

	LIST_SUFFIX: "list",
	EDIT_SUFFIX: "edit",
	MARK_ALL_READ_SUFFIX: "mark-all-as-read",
	TOKEN_SUFFIX: "token",
	USERINFO_SUFFIX: "user-info",
	UNREAD_SUFFIX: "unread-count",
	RENAME_LABEL_SUFFIX: "rename-tag",
	EDIT_TAG_SUFFIX: "edit-tag",

	TAGS: {
		"like": "user/-/state/com.google/like",
		"label": "user/-/label/",
		"star": "user/-/state/com.google/starred",
		"read": "user/-/state/com.google/read",
		"fresh": "user/-/state/com.google/fresh",
		"share": "user/-/state/com.google/broadcast",
		"kept-unread": "user/-/state/com.google/kept-unread",
		"reading-list": "user/-/state/com.google/reading-list",	
	},


	/*variables*/
	is_logged_in: false,
	is_initialized: false,
	has_loaded_prefs: false,


	_feeds: [],
	setFeeds: function(feeds){
		this._feeds = feeds;	
	},
	getFeeds: function(){
		return this._feeds;	
	},
	getLabels: function(){
		return _.select(reader.getFeeds(), function(feed){ return feed.isLabel;	});
	},

	setUser: function(user){
		localStorage["User"] = JSON.stringify(user);
	},
	getUser: function(){
		return JSON.parse(localStorage["User"]);
	},

	_Auth: "",
	getAuth: function(){
		if(reader._Auth !== "undefined"){
			return reader._Auth;		
		}
	},
	setAuth: function(auth){
		reader._Auth = auth;	
	},

	token: "",

	requests: [],

	makeRequest: function(obj, noAuth){
		//make sure we have a method
		if(!obj.method){
			obj.method = "GET";
		}
		//make sure we have a parameters object
		if(!obj.parameters){
			obj.parameters = {};
		}

		//add the necessary parameters to get our requests to function properly
		if(obj.method === "GET"){
			obj.parameters["ck"] = Date.now() || new Date().getTime();
			obj.parameters["accountType"] = "GOOGLE";
			obj.parameters["service"] = "reader";
			obj.parameters["output"] = "json";	
			obj.parameters["client"] = reader.CLIENT;
		}

		//if we have a token, add it to the parameters
		if(reader.token){
			if(obj.method === "POST"){
				//it seems that "GET" requests don't care about your token
				obj.parameters["T"] = reader.token;			
			}
		}
		
		//turn our parameters object into a query string
		var queries = [];
		for (var i in obj.parameters) {
			queries.push(encodeURIComponent(i) + "=" + encodeURIComponent(obj.parameters[i]));
		}
		var queryString = queries.join("&");

		var url = (obj.method === "GET") ? (obj.url + "?" + queryString): (obj.url + "?" + encodeURIComponent("client") + "=" + encodeURIComponent(reader.CLIENT));
			//for get requests, attach the queryString
			//for post requests, attach just the client constant

		var request = new XMLHttpRequest();
		request.open(obj.method, url, true);

		//set request header
		request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

		if(reader.getAuth() && !noAuth){
			//this one is important. This is how google does authorization.
			request.setRequestHeader("Authorization", "GoogleLogin auth=" + reader.getAuth());    	
		}

		request.onreadystatechange = function(){
			if ((request.readyState === 4) && request.status === 200) {
				if(obj.onSuccess){
					obj.onSuccess(request);
				}
			} else if(request.readyState === 4){
				if(obj.method === "POST"){
					if(!obj.tried){
						//If it failed and this is a post request, try getting a new token, then do the request again
						reader.getToken(function(){
							obj.tried = true;
							reader.makeRequest(obj);
						}, obj.onFailure);
					}
				} else {
					if(obj.onFailure){
						obj.onFailure(request);
					}
				}

				console.error(request);
			}
		};
		
		request.send((obj.method === "POST") ? queryString: "");
		
		this.requests.push(request);
	},

	// *************************************
	// *
	// *	Authentication
	// *
	// *************************************

	load: function(){
		reader.is_logged_in = false;
		reader.is_initialized = true;
		
		//check storage for the tokens we need.
		if(localStorage.Auth && localStorage.Auth !== "undefined"){
			reader.setAuth(localStorage.Auth);
			reader.is_logged_in = true;
		} 
		return(reader.is_logged_in);

	},

	login: function(email, password, successCallback, failCallback){
		if(email.length === 0 || password.length === 0){
			failCallback("Blank Info...");
		}
		reader.makeRequest({
			method: "GET",
			url: reader.LOGIN_URL,
			parameters: {
				Email: email,
				Passwd: password,
			},
			onSuccess: function(transport){
				localStorage.Auth = _(transport.responseText).lines()[2].replace("Auth=", "");
				
				reader.load();

				reader.getUserInfo(successCallback);
	
			},
			onFailure: function(transport){
				console.error(transport);
				failCallback(reader.normalizeError(transport.responseText));
			}
		});
	},
	logout: function(){
		reader.is_logged_in = false;
		localStorage["Auth"] = undefined;
		reader.setUser({});
		reader.setAuth("");
		reader.setFeeds([]);
	},
	getUserInfo: function(successCallback, failCallback){
		reader.makeRequest({
			method: "GET",
			url: reader.BASE_URL + reader.USERINFO_SUFFIX,
			parameters: {},
			onSuccess: function(transport){
				reader.setUser(JSON.parse(transport.responseText));

				successCallback();
			},
			onFailure: function(transport){
				console.error(transport);
				if(failCallback){
					failCallback(reader.normalizeError(transport.responseText));
					
				}
			}
		});			

	},
	getUserPreferences: function(successCallback, failCallback){
		reader.makeRequest({
			method: "GET",
			url: reader.BASE_URL + reader.PREFERENCES_PATH,
			parameters: {},
			onSuccess: function(transport){
				reader.has_loaded_prefs = true;
				reader.userPrefs = JSON.parse(transport.responseText).streamprefs;
				if(successCallback){
					successCallback();				
				}
			},
			onFailure: function(transport){
				console.error(transport);
				if(failCallback){
					failCallback(reader.normalizeError(transport.responseText));
					
				}
			}
		});		
	},

	//Get the token
	getToken: function(successCallback, failCallback){
		reader.makeRequest({
			method: "GET",
			url: reader.BASE_URL + reader.TOKEN_SUFFIX,
			parameters: {},
			onSuccess: function(transport){
				reader.token = transport.responseText;
				successCallback();
				
			}, 
			onFailure: function(transport){
				console.error("failed", transport);
				if(failCallback){
					failCallback(reader.normalizeError(transport.responseText));
				}
			}
		});
	},

	// *************************************
	// *
	// *	Loading Feeds
	// *
	// *************************************

	//Get the user's subscribed feeds
	loadFeeds: function(successCallback){
		function loadFeeds(){
			reader.makeRequest({
				method: "GET",
				url: reader.BASE_URL + reader.SUBSCRIPTIONS_PATH + reader.LIST_SUFFIX,
				onSuccess: function(transport){
					//save feeds in an organized state.

					reader.loadTags(function(tags){
						//get unread counts
						reader.getUnreadCounts(function(unreadcounts){

							//organize and save feeds
							reader.setFeeds(
								reader.organizeFeeds(
									JSON.parse(transport.responseText).subscriptions, 
									tags, 
									unreadcounts,
									reader.userPrefs
								)
							);

							//callback with our feeds
							successCallback(reader.getFeeds());
						});	

					})
					
				},
				onFailure: function(transport){
					console.error(transport);
				}
			});	
		}
		if(reader.has_loaded_prefs){
			loadFeeds();
		} else {
			reader.getUserPreferences(loadFeeds);
		}
	},

	loadTags: function(successCallback){
		reader.makeRequest({
			method: "GET",
			url: reader.BASE_URL + reader.TAGS_PATH + reader.LIST_SUFFIX,
			onSuccess: function(transport){
				//save feeds in an organized state.
				successCallback(JSON.parse(transport.responseText).tags);
			},
			onFailure: function(transport){
				console.error(transport);
			}
		});	
	
	},
	idRegExp: /user\/\d*\//,
	correctId: function(id){
		return id.replace(reader.idRegExp, "user\/-\/");
	},
	//organizes feeds based on categories/labels.
	organizeFeeds: function(subscriptions, tags, unreadCounts, userPrefs){
		var uncategorized = [];

		//prepare tags
		tags.unshift({title: "All", id: reader.TAGS["reading-list"], feeds: subscriptions, isAll: true, isSpecial: true});
		tags.pop() //remove "user/-/state/com.blogger/blogger-following"
		var tagTitleRegExp = /[^\/]+$/i;
		_(tags).each(function(tag){
		
			//give tags a .title
			if(!tag.title){
				tag.title = tagTitleRegExp.exec(tag.id)[0];	
			}

			//based on title add unique properties
			if(tag.title === "starred"){
				tag.title = _(tag.title).capitalize();
				tag.isSpecial = true;
			} else if(tag.title === "broadcast"){
				tag.title = "Shared";
				tag.isSpecial = true;
			} else if(!tag.isSpecial){
				tag.isLabel = true;
			}

			tag.feeds = [];
		
			//remove digits from the id
			tag.id = reader.correctId(tag.id);

			//apply unreadCounts
			_(unreadCounts).each(function(unreadCount){
				unreadCount.id = reader.correctId(unreadCount.id);

				if(tag.id === unreadCount.id){
					tag.count = unreadCount.count;
					tag.newestItemTimestamp = unreadCount.newestItemTimestampUsec;	
				}
			});
		});

		//process subscriptions
		_(subscriptions).each(function(sub){
			//give isFeed property, useful for identifying
			sub.isFeed = true;

			//replace digits from the id
			sub.id = reader.correctId(sub.id);

			//apply unread counts
			_(unreadCounts).each(function(unreadCount){
				if(sub.id === unreadCount.id){
					sub.count = unreadCount.count;
					sub.newestItemTimestamp = unreadCount.newestItemTimestampUsec;	
				}
			});

			if(sub.categories.length === 0){
				//if the subscription has no categories, push it onto the uncategorized array
				uncategorized.push(sub);
			} else {
				//otherwise find the category from the tags array and push the sub into its feeds array
				_(sub.categories).each(function(tag){
					tag.id = reader.correctId(tag.id);
					_(tags).each(function(fullTag){
						if(tag.id === fullTag.id){
							var sub_clone = _(sub).clone();
								sub_clone.inside = fullTag.id;

							fullTag.feeds.push(sub_clone);
						}
					});
				});
			}

		});

		//replace digits
		_(userPrefs).each(function(value, key){
			if(/user\/\d*\//.test(key)){
				userPrefs[reader.correctId(key)] = value;
			}
		});

		//remove tags with no feeds
		var tagsWithFeeds = _(tags).reject(function(tag){
			return (tag.feeds.length === 0 && !tag.isSpecial);
		});

		//order the feeds within tags
		_(tagsWithFeeds).each(function(tag){
			//get the ordering id based on the userPrefs
			var orderingId = _(userPrefs[tag.id]).detect(function(setting){
				return (setting.id === "subscription-ordering");
			});
			if(orderingId){
				tag.feeds = _(tag.feeds).sortBy(function(feed){
					if(orderingId.value.indexOf(feed.sortid) === -1){
						//if our sortid isn't there, the feed should be at the back.
						return 1000;
					}
					//return the index of our feed sortid, which will be in multiples of 8 since sortid's are 8 characters long.
					return (orderingId.value.indexOf(feed.sortid))/8;
				});	
			} //else {
				//tag.feeds.sort();
			//}
			
		});

		console.log("userPrefs" + JSON.stringify(userPrefs));

		//now order ALL feeds and tags
		var orderingId = _(userPrefs["user/-/state/com.google/root"]).detect(function(setting){
			return (setting.id === "subscription-ordering");
		}) || {value: ""};
		

		//our feeds are our tagsWithFeeds + our uncategorized subscriptions
		var feeds = [].concat(tagsWithFeeds, uncategorized);
			//sort them by sortid
			feeds = _(feeds).sortBy(function(feed){
				if(orderingId.value.indexOf(feed.sortid) === -1 && !feed.isSpecial){
					return 1000;
				}
				return (orderingId.value.indexOf(feed.sortid))/8;
			});

		return feeds;
	},

	//returns url for image to use in the icon
	getIconForFeed: function(feedUrl){
		return "http://www.google.com/s2/favicons?domain_url=" + encodeURIComponent(feedUrl);
	},

	//get unread counts from google reader
	getUnreadCounts: function(successCallback, returnObject){
		reader.makeRequest({
			url: reader.BASE_URL + reader.UNREAD_SUFFIX,
			onSuccess: function(transport){
				var unreadCounts = JSON.parse(transport.responseText).unreadcounts;
				//console.log(transport);
				var unreadCountsObj = {};
				_(unreadCounts).each(function(obj){
					unreadCountsObj[reader.correctId(obj.id)] = obj.count;
				});
				reader.unreadCountsObj = unreadCountsObj;

				if(returnObject){
					successCallback(unreadCountsObj);	
				} else {
					successCallback(unreadCounts);
				}
				
			}, 
			onFailure: function(transport){
				console.error(transport);
			}		
		});
	},
	decrementUnreadCount: function(feedId, callback){
		_.each(reader.getFeeds(), function(subscription){
			if(subscription.id === feedId || (subscription.isAll)){
				subscription.count--;
			} else if(subscription.feeds && subscription.feeds.length > 0){
				_.each(subscription.feeds, function(feed){
					if(feed.id === feedId){
						subscription.count--;
					}
				});
			}
		});
		callback();
	},

	//integrate unread counts to our feeds array
	setFeedUnreadCounts: function(unreadCounts){
		_.each(reader.getFeeds(), function(subscription){
			for(var i = 0; i < unreadCounts.length; i++){
				if(subscription.id === unreadCounts[i].id || (subscription.isAll && _(unreadCounts[i].id).includes("state/com.google/reading-list"))){
					subscription.count = unreadCounts[i].count;
					subscription.newestItemTimestamp = unreadCounts[i].newestItemTimestampUsec;	
				}
				_.each(subscription.feeds, function(feed){
					if(feed.id === unreadCounts[i].id){
						feed.count = unreadCounts[i].count;
						feed.newestItemTimestamp = unreadCounts[i].newestItemTimestampUsec;	
					}
				});
			}
		});
	},


	// *************************************
	// *
	// *	Editing Feeds
	// *
	// *************************************

	editFeed: function(params, successCallback){
		if(!params){
			console.error("No params for feed edit");
			return;
		}
		
		reader.makeRequest({
			method: "POST",
			url: reader.BASE_URL + reader.SUBSCRIPTIONS_PATH + reader.EDIT_SUFFIX,
			parameters: params,
			onSuccess: function(transport){
				successCallback(transport.responseText);
			}, 
			onFailure: function(transport){
				console.error(transport);
			}
		})

	},
	editFeedTitle: function(feed, newTitle, successCallback){
		reader.editFeed({
			ac: "edit",
			t: newTitle,
			s: feed
		}, successCallback);
	},

	editFeedLabel: function(feed, label, opt, successCallback){
		var obj = {
			ac: "edit",
			s: feed
		}
		if(opt){
			obj.a = label;
		} else {
			obj.r = label;
		}
		reader.editFeed(obj, successCallback);
	},


	unsubscribeFeed: function(feed, successCallback){
		reader.editFeed({
			ac: "unsubscribe",
			s: feed
		}, successCallback);
	},

	subscribeFeed: function(feedUrl, successCallback, title){
		reader.editFeed({
			ac: "subscribe",
			s: "feed/" + feedUrl,
			t: title || undefined
		}, successCallback);

	},


	editLabelTitle: function(label, newTitle, successCallback){
		reader.makeRequest({
			method: "POST",
			url: reader.BASE_URL + reader.RENAME_LABEL_SUFFIX,
			parameters: {
				s: reader.LABEL_PATH + label,
				t: label,
				dest: reader.LABEL_PATH + newTitle
			},
			onSuccess: function(transport){
				successCallback(transport.responseText);
			}, 
			onFailure: function(transport){
				console.error(transport);
			}

		});

	},

	markAllAsRead: function(feedOrLabel, successCallback){
		//feed or label
		reader.makeRequest({
			method: "POST",
			url: reader.BASE_URL + reader.MARK_ALL_READ_SUFFIX,
			parameters: {
				s: feedOrLabel
			},
			onSuccess: function(transport){
				successCallback(transport.responseText);
			}, 
			onFailure: function(transport){
				console.error(transport);
			}

		});
	},

	// *************************************
	// *
	// *	Adding a Feed
	// *
	// *************************************

	urlRegex: /(http|ftp|https):\/\/[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?^=%&amp;:\/~\+#]*[\w\-\@?^=%&amp;\/~\+#])?/,
	processFeedInput: function(input, inputType, successCallback, failCallback){
		var url = "https://ajax.googleapis.com/ajax/services/feed/";
		if((reader.urlRegex.test(input) || inputType === "url") && inputType !== "keyword"){
			url += "load";
		} else {
			url += "find";
			input = input.replace(/\.\w{1,3}\.*\w{0,2}$/ig, "");
			//console.log("replaced input", input);
		}
		reader.makeRequest({
			url: url,
			parameters: {
				q: encodeURI(input),
				v: "1.0"				
			},
			onSuccess: function(transport){
				var response = JSON.parse(transport.responseText);
				if(response.responseStatus === 200){
					if(response.responseData.entries){
						successCallback(response.responseData.entries, "keyword");
					} else {
						successCallback(response.responseData.feed, "url");
					}
				} else {
					failCallback(response.responseDetails);
				}

			}, 
			onFailure: function(transport){
				console.error(transport);
			}			
		}, true);
		
	},
	// *************************************
	// *
	// *	Loading Items
	// *
	// *************************************

	getItems: function(feedUrl, successCallback, opts){
		var params = opts || {};
		
			params.r = "d"
			params.n = params.n || 50;
			
		reader.makeRequest({
			method: "GET",
			url: reader.BASE_URL + reader.STREAM_PATH + encodeURIComponent(feedUrl),
			parameters: params, /*{
				//ot: new Date().getTime(), //ot=[unix timestamp] : The time from which you want to retrieve items. Only items that have been crawled by Google Reader after this time will be returned.
				r: "d",						//r=[d|n|o] : Sort order of item results. d or n gives items in descending date order, o in ascending order.
				//xt: "",					//xt=[exclude target] : Used to exclude certain items from the feed. For example, using xt=user/-/state/com.google/read will exclude items that the current user has marked as read, or xt=feed/[feedurl] will exclude items from a particular feed (obviously not useful in this request, but xt appears in other listing requests).
			},*/
			onSuccess: function(transport){
				successCallback(JSON.parse(transport.responseText).items);
			}, 
			onFailure: function(transport){
				console.error(transport);
			}
		});
	},

	// *************************************
	// *
	// *	Editing Items
	// *
	// *************************************

	setItemTag: function(feed, item, tag, add, successCallback){
		//feed id
		//item id
		//tag in simple form: "like", "read", "share", "label", "star", "kept-unread"
		//add === true, or add === false

		var params = {
			s: feed,
			i: item,
			async: "true",
			ac: "edit-tags"
		}
		if(add === true){
			params.a = reader.TAGS[tag];
		} else {
			params.r = reader.TAGS[tag];
		}
		reader.makeRequest({
			method: "POST",
			url: reader.BASE_URL + reader.EDIT_TAG_SUFFIX,
			parameters: params,
			onSuccess: function(transport){
				if(transport.responseText === "OK"){
					successCallback(transport.responseText);	
				}
			}, 
			onFailure: function(transport){
				console.error(transport);
			} 
		})	
	},

	// *************************************
	// *
	// *	Utilities
	// *
	// *************************************

	normalizeError: function(inErrorResponse){
		return _(inErrorResponse).lines()[0].replace("Error=", "").replace(/(\w)([A-Z])/g, "$1 $2");
	}
}