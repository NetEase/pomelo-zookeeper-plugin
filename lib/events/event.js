var utils = require('../util/utils');
var countDownLatch = require('../util/countDownLatch');
var logger = require('pomelo-logger').getLogger('pomelo-zookeeper-plugin', __filename);

var Event = function(app) {
	this.app = app;
};

module.exports = Event;

Event.prototype.start_server = function(id) {
	getResults(this, watchServer.bind(this));
};

var getServers = function(app, zk, servers) {
	var success = true;
	var results = {};
	if(!servers.length)	{
		logger.error('get servers data is null.');
		return;
	}
	var latch = countDownLatch.createCountDownLatch(servers.length, {timeout: 1000 * 60}, function() {
		if(!success) {
			logger.error('get all children data failed, with serverId: %s', app.serverId);
			return;
		}
		app.replaceServers(results);
	});
	for(var i = 0; i < servers.length; i++) {
		(function(index) {
			var serverFromConfig = app.getServerFromConfig(servers[index]);
			if(!!serverFromConfig) {
				results[serverFromConfig.id] = serverFromConfig;
				latch.done();
			}	else {
				zk.getData(zk.path + '/' + servers[index], function(err, data) {
					if(!!err)	{
						logger.error('%s get data failed for server %s, with err: %j', app.serverId, servers[index], err.stack);
						latch.done();
						success = false;
						return;
					}
					var serverInfo = JSON.parse(data);
					results[serverInfo.id] = serverInfo;
					latch.done();
				});
			}
		})(i);
	}
};

var watchServer = function(event) {
	var self = this;
	var zookeeper = this.app.components.__zookeeper__;
	zookeeper.getChildren(watchServer.bind(this), function(err, children) {
		if(!!err)	{
			logger.error('get children failed when watch server, with err: %j', err.stack);
			return;
		}
		getServers(self.app, zookeeper, children);
	});
};

var getResults = function(self, func)	{
	var zookeeper = self.app.components.__zookeeper__;
	zookeeper.getChildren(func, function(err, children) {
		if(!!err)	{
			logger.error('get results failed when watch server, with err: %j', err.stack);
			return;
		}
		getServers(self.app, zookeeper, children);
	});
};