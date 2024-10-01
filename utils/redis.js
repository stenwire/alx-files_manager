import redis from 'redis';
import util from 'util';

class RedisClient {
  constructor() {
    this.client = redis.createClient();
    this.client.on('error', (err) => console.log(err));
    this.client.get = util.promisify(this.client.get);
    this.client.set = util.promisify(this.client.set);
    this.client.del = util.promisify(this.client.del);
  }

  isAlive() {
    if (this.client.stream.connecting) { // attempting connection
      // return false if error occured else true
      return !this.client.stream._hadError;
    }
    return this.client.connected;
  }

  async get(key) {
    const value = await this.client.get(key);
    return value;
  }

  async set(key, value, duration) {
    this.client.set(key, value, 'EX', duration);
  }

  async del(key) {
    this.client.del(key);
  }
}

const redisClient = new RedisClient();
export default redisClient;
