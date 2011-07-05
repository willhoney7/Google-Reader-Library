/*
	This library requires the underscore library found at http://documentcloud.github.com/underscore/ 
	This library requires the underscore string library found at http://edtsech.github.com/underscore.string/
*/

reader = {
	/*constants*/
	LOGIN_URL: "https://www.google.com/accounts/ClientLogin",
	BASE_URL: "http://www.google.com/reader/api/0/",
	TOKEN_SUFFIX: "token",
	SUBSCRIPTIONS_SUFFIX: "subscription/list",


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

	normalizeError: function(inErrorResponse){
		return _(inErrorResponse).lines()[0].replace("Error=", "").replace(/(\w)([A-Z])/g, "$1 $2");
	}
}