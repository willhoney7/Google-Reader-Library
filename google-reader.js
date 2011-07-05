/*
	This library requires the underscore library found at http://documentcloud.github.com/underscore/ 
	This library requires the underscore string library found at http://edtsech.github.com/underscore.string/
*/

reader = {
	/*constants*/

	//urls
	LOGIN_URL: "https://www.google.com/accounts/ClientLogin",
	BASE_URL: "http://www.google.com/reader/api/0/",

	//url suffixes
	TOKEN_SUFFIX: "token",
	SUBSCRIPTIONS_SUFFIX: "subscription/list",
	ALLITEMS_SUFFIX: "stream/contents/user/-/state/com.google/reading-list",
	STREAM_SUFFIX: "stream/contents/",

	//other constants
	FEED_ALL_ID: "_all",


	/*variables*/
	is_logged_in: false,
	is_authenticated: false,

	AUTH: "",
	getAUTH: function(){
		return reader.AUTH;	
	},
	token: "",

	makeRequest: function(obj){
		//make sure we have a method
		if(!obj.method){
			obj.method = "GET";
		}
		//make sure we have a parameters object
		if(!obj.parameters){
			obj.parameters = {};
		}
		//add the necessary parameters to get our requests to function properly
		obj.parameters["accountType"] = "GOOGLE";
		obj.parameters["service"] = "reader";
		obj.parameters["output"] = "json";

		//if we have a token, add it to the parameters
		if(reader.token){
			obj.parameters["t"] = reader.token;
		}
		
		//turn our parameters object into a query string
		var queries = [];
		for (var i in obj.parameters) {
			queries.push(encodeURIComponent(i) + "=" + encodeURIComponent(obj.parameters[i]))
        }
        var queryString = queries.join("&");

  		var url = (obj.method === "GET") ? (obj.url + "?" + queryString): obj.url;
		this.request = new XMLHttpRequest();
		this.request.open(obj.method, url, true);

		//set request header
		this.request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

		if(reader.getAUTH()){
			//this one is important. This is how google does authorization.
			this.request.setRequestHeader("Authorization", "GoogleLogin auth=" + reader.getAUTH());    	
        }
        var self = this;

        this.request.onreadystatechange = 
        	function(){
				if ((self.request.readyState === 4) && self.request.status === 200) {
			   		if(obj.onSuccess){
			   			obj.onSuccess(self.request);
			   		}
			    } else if(self.request.readyState < 2){
			    	if(obj.onFailure){
			    		obj.onFailure(self.request);
			    	}
			    	console.error(self.request);
			    }
		};
		
		this.request.send((obj.method === "POST") ? queryString: "");
       
	},

	load: function(){
		reader.is_logged_in = false;
		//check storage for the tokens we need.

		if(localStorage.AUTH){
			reader.AUTH = localStorage.AUTH
			reader.is_logged_in = true;
			console.log("logged in", reader.getAUTH());

		} 
		return(reader.is_logged_in);
	},

	login: function(email, password, successCallback, failCallback){
		reader.makeRequest({
			method: "GET",
			url: reader.LOGIN_URL,
			parameters: {
				Email: email,
				Passwd: password,
			},
			onSuccess: function(transport){
				console.log("logged in", transport);

				localStorage.AUTH = _(transport.responseText).lines()[2].replace("Auth=", "");
				reader.load();
				successCallback();
				
			},
			onFailure: function(transport){
				console.error(transport);
				failCallback(reader.normalizeError(transport.responseText));
			},
			onError: function(transport){
				console.error(transport);
				failCallback(reader.normalizeError(transport.responseText));
			}
		})
	},
	getToken: function(successCallback, failCallback){
		reader.makeRequest({
			method: "GET",
			url: reader.BASE_URL + reader.TOKEN_SUFFIX,
			parameters: {
				client: "js-googlereader"
			},
			onSuccess: function(transport){
				reader.token = transport.responseText;
				successCallback();
				
			}, 
			onFailure: function(transport){
				console.error("failed", transport);
				failCallback(reader.normalizeError(transport.responseText));
			}
		});
	},


	getSubscriptions: function(successCallback){
		reader.makeRequest({
			method: "GET",
			url: reader.BASE_URL + reader.SUBSCRIPTIONS_SUFFIX,
			onSuccess: function(transport){
				successCallback(JSON.parse(transport.responseText).subscriptions);
			},
			onFailure: function(transport){
				console.error(transport);
			}
		})
	},

	getAllItems: function(successCallback){
		reader.makeRequest({
			method: "GET",
			url: reader.BASE_URL + reader.ALLITEMS_SUFFIX,
			parameters: {
				ck: new Date().getTime()			
			},
			onSuccess: function(transport){
				console.log(transport);
				successCallback(JSON.parse(transport.responseText).items);
			},
			onFailure: function(transport){
				console.error(transport);
			}
		});
	},
	getItems: function(feedUrl, successCallback){
		reader.makeRequest({
			method: "GET",
			url: reader.BASE_URL + reader.STREAM_SUFFIX + feedUrl,
			parameters: {
				//ot: new Date().getTime(), //ot=[unix timestamp] : The time from which you want to retrieve items. Only items that have been crawled by Google Reader after this time will be returned.
				r: "d",						//r=[d|n|o] : Sort order of item results. d or n gives items in descending date order, o in ascending order.
				//xt: "",					//xt=[exclude target] : Used to exclude certain items from the feed. For example, using xt=user/-/state/com.google/read will exclude items that the current user has marked as read, or xt=feed/[feedurl] will exclude items from a particular feed (obviously not useful in this request, but xt appears in other listing requests).
				ck: new Date().getTime(), 	//Use the current Unix time here, helps Google with caching.
				client: "Tibfib"			//You can use the default Google client (scroll), but it doesn't seem to make a difference. Google probably uses this field to gather data on who is accessing the API, so I'd advise using your own unique string to identify your software.
			},
			onSuccess: function(transport){
				console.log(transport);
				successCallback(JSON.parse(transport.responseText).items);
			}, 
			onFailure: function(transport){
				console.error(transport);
			}
		});

	},

	normalizeError: function(inErrorResponse){
		return _(inErrorResponse).lines()[0].replace("Error=", "").replace(/(\w)([A-Z])/g, "$1 $2");
	}
}