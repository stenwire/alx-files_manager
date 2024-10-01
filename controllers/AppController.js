import redisClient from '../utils/redis';
import dbClient from '../utils/db';

export default class AppController {
  static getStatus(req, res) {
    if (dbClient.isAlive() && redisClient.isAlive()) {
      return res.send({ redis: true, db: true });
    }
    return res.status(500).send({ error: 'storage not ready' });
  }

  static async getStats(req, res) {
    const numberOfUsers = await dbClient.nbUsers();
    const numberOfFiles = await dbClient.nbFiles();
    return res.send({ users: numberOfUsers, files: numberOfFiles });
  }
}
