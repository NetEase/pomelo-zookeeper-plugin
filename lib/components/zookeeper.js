var util = require('util');
var crypto = require('crypto');
var utils = require('../util/utils');
var zookeeper = require('node-zookeeper-client');
var CreateMode = zookeeper.CreateMode;
var EventEmitter = require('events').EventEmitter;
var logger = require('pomelo-logger').getLogger('pomelo-zookeeper-plugin', __filename);

module.exports = function(app, opts) {
	var component =  new Component(app, opts);
	return component;
};

var Component = function(app, opts) {
  this.app = app;
  this.hosts = opts.server || '127.0.0.1:2181';
  this.path = opts.path || '/pomelo/servers';
  this.username = opts.username || 'pomelo';
  this.password = opts.password || 'pomelo';
  this.timeout = opts.timeout || 15000;
  this.setACL = opts.setACL;
  this.nodePath = this.path + '/' + this.app.serverId;
  this.authentication = this.username + ':' + this.password;
  var shaDigest = crypto.createHash('sha1').update(this.authentication).digest('base64');
  this.acls = [
  new zookeeper.ACL(
    zookeeper.Permission.ALL,
    new zookeeper.Id('digest', this.username + ':' + shaDigest)
    )
  ];

  this.client = zookeeper.createClient(this.hosts, {sessionTimeout: this.timeout});

  var self = this;
  this.client.once('connected', function() {
    self.client.addAuthInfo('digest', new Buffer(self.authentication));
    if(self.setACL) {
      self.client.setACL(self.path, self.acls, -1, function(err, stat) {
        if(!!err) {
          logger.error('Failed to set ACL: %j', err.stack);
          return;
        }
        logger.info('ACL is set to: %j', self.acls);
      });
    }
  });

  this.client.on('disconnected', function() {
    logger.error('%s disconnect with zookeeper server.', self.app.serverId);
  });

  this.client.connect();
};

var pro = Component.prototype;

pro.name = '__zookeeper__';

pro.start = function(cb) {
	if(this.app.serverType === 'master') {
		this.createNode(this.path, null, CreateMode.PERSISTENT, function(err, result) {
			if(!!err)	{
        logger.error('create master node failed, with err : %j', err.stack);
        utils.invokeCallback(cb, err);
        return;
      }
      utils.invokeCallback(cb);
    });
  } else {
    var serverInfo = this.app.getCurServer();
    serverInfo.pid = process.pid;
    var buffer = new Buffer(JSON.stringify(serverInfo));
    this.createNode(this.nodePath, buffer, CreateMode.EPHEMERAL, function(err, path) {
      if(!!err)	{
       logger.error('create server node %s failed, with err : %j ', this.nodePath, err.stack);
       utils.invokeCallback(cb, err);
       return;
     }
     utils.invokeCallback(cb);
   });
  }
};

pro.stop = function(force, cb) {
	this.client.close();
  utils.invokeCallback(cb);
};

pro.createNode = function(path, value, mode, cb) {
	var self = this;
  self.client.exists(path, function(err, stat) {
    if(!!err) {
      utils.invokeCallback(cb, err);
      return;
    }
    if(!stat) {
      self.client.create(path, value, mode, function(err, result) {
        utils.invokeCallback(cb, err, result);
        return;
      });
    } else {
      utils.invokeCallback(cb);
      return;
    }
  });
};

pro.getData = function(path, cb) {
  this.client.getData(path, function(err, data) {
    if(!!err) {
      utils.invokeCallback(cb, err);
      return;
    }
    utils.invokeCallback(cb, null, data.toString());
  });
};

pro.getChildren = function(fun, cb) {
  var self = this;
  this.client.getChildren(this.path, fun, function(err, children, stats) {
    if(!!err) {
      utils.invokeCallback(cb, err);
      return;
    }
    utils.invokeCallback(cb, null, children);
  });
};