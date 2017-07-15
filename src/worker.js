var config = require('./config.js');
var objects = require('./objects.js');

var FB = require('fb');

var splitted_url = config.db_remote_url.split('://');
var auth_url = splitted_url[0]+'://'+config.db_username+':'+config.db_password+'@'+splitted_url[1];
console.log(auth_url);

var nano = require('nano')(auth_url); // store cookies, normally redis or something



var spotr_worker = new function(){

	this.postsDB = nano.use('posts');
	this.targetDB = nano.use('targets');



	this.run = function(){
		var items = [];
		var self = this;
		console.log('get posts from db ...');
		this.getPostsFromDB(function(postsInDB){
				console.log('received '+postsInDB.total_rows+' rows from feed');

			//create array of ids to avoid duplicate requests
			var idsInDB = [];
			postsInDB.rows.forEach(function(postFromDB){
				idsInDB.push(postFromDB.id);
			});
			self.getTargetsFromDB(function(targets){
				targets.rows.forEach(function(object){

					//object looks like  { id: 'asd',key: 'asd',value: { rev: '1-7e92b7a8f8da380d9224101bc0d3de9a' }, doc: { _id: 'asd',_rev: '1-7e92b7a8f8da380d9224101bc0d3de9a', title: 'asd(...) 
					object = object.doc;

					console.log('receive posts from facebook ...');
					self.getPostsFromFB(object.facebook,function(res){
						console.log('received '+res.data.length+' entries from feed');
						res.data.forEach(function(item) {

						  	item._id = 'fb-post-'+config.user_id+'-'+item.id;

						  	if(idsInDB.indexOf(item._id)>-1){
						  		//console.log('allready in db');
						  		return true;
						  	}

						  	delete item.id;
						  	item.post_type=item.type;
						  	item.type='facebook';
						  	item.post_id=item.id;
						  	item.user_id = config.user_id;
						  	item.author = object.facebook;
						  	item.timestamp = new Date(item.created_time).toISOString();
						  	item.seen = false;
						  	item.ignore = false;
						  	item.created_post = null;
						  	items.push(item);

						});


						if(items.length > 0)
							self.postsDB.bulk({docs:items}, function(err, body) {
								  console.log('request done:')
								  console.log(body);
							});
						else
							console.log('nothing to update');
					});
				});

			});

			
		})
	};
	this.getPostsFromFB = function(pagetitle,cb){

			FB.api('oauth/access_token', {
			    client_id:config.fb_client_id,
			    client_secret: config.fb_client_secret,
			    grant_type: 'client_credentials'
			}, function (res) {
			    if(!res || res.error) {
			        console.log(!res ? 'error occurred' : res.error);
			        return;
			    }
			    
			    console.log('got access token');
			    console.log(res);

				FB.setAccessToken(res.access_token);

				FB.api(pagetitle+'/feed?fields=created_time,type,message,story,attachments,link,actions,place,tags,object_attachment,targeting,feed_targeting,published,scheduled_publish_time,backdated_time,backdated_time_granularity,child_attachments,multi_share_optimized,multi_share_end_card', function (res) {
				//FB.api('coastGuardly/feed', function (res) {
				  if(!res || res.error) {
				   console.log(!res ? 'error occurred' : res.error);
				   return;
				  }
				  cb(res);
				  

				});
			});

	};
	this.getPostsFromDB = function(cb){
		this.postsDB.list({include_docs:true}, function(err,body,headers) {
		  if (!err) {
		    cb(body);
		  }else{
		  	console.log({error:err});
		  }
		});
	}
	this.getTargetsFromDB = function(cb){
		this.targetDB.list({include_docs:true}, function(err,body,headers) {
		  if (!err) {
		    cb(body);
		  }else{
		  	console.log({error:err});
		  }
		});
	}
}


spotr_worker.run();

