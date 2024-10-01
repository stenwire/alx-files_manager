import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

export default class AuthController {
  static async getConnect(req, res) {
    const auth = req.get('Authorization');
    const base64Credential = AuthController.getCredential(auth);
    if (!base64Credential) return res.status(401).send({ error: 'Unauthorized' });
    const decodedCred = AuthController.decodedeBase64(base64Credential);
    const credList = AuthController.parseAuthHeader(decodedCred);
    if (!credList) return res.status(401).send({ error: 'Unauthorized' });
    const [email, password] = credList;
    const users = await dbClient.find('users', 'email', email);
    const user = users[0];
    if (!user) return res.status(401).send({ error: 'Unauthorized' });
    if (!AuthController.validatePassword(password, user.password)) {
      return res.status(401).send({ error: 'Unauthorized' });
    }
    const token = uuidv4();
    const key = `auth_${token}`;
    redisClient.set(key, user._id.toString(), 86400);
    return res.send({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.get('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    const users = await dbClient.find('users', '_id', userId);
    const user = users[0];
    if (!user) return res.status(401).send({ error: 'Unauthorized' });
    redisClient.del(`auth_${token}`);
    return res.status(204).end();
  }

  static getCredential(auth) {
    if (!auth) return null;
    const components = auth.split(' ');
    if (components[0] !== 'Basic') return null;
    if (!components[1]) return null;
    return components[1];
  }

  static parseAuthHeader(header) {
    if (!header) return null;
    const indexOfColon = header.indexOf(':');
    if (indexOfColon === -1) return null;
    const email = header.slice(0, indexOfColon);
    const password = header.slice(indexOfColon + 1);
    return [email, password];
  }

  static validatePassword(submittedPassword, dbPassword) {
    return sha1(submittedPassword) === dbPassword;
  }

  static decodedeBase64(encoding) {
    const buffer = Buffer.from(encoding, 'base64');
    const plainStr = buffer.toString('utf8');
    return plainStr;
  }
}
