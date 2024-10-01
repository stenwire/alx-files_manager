import { v4 as uuidv4 } from 'uuid';
import { promises } from 'fs';
import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import { fileQueue } from '../worker';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import UsersController from './UsersController';

export { dbClient };

const { open, mkdir } = promises;
const folder = process.env.FOLDER_PATH || '/tmp/files_manager';

export default class FilesController {
  static async postUpload(req, res) {
    if (redisClient.isAlive() && dbClient.isAlive()) {
      const token = req.get('X-Token');
      const userId = await redisClient.get(`auth_${token}`);
      const user = await UsersController.getUser(userId);
      if (!user) return res.status(401).send({ error: 'Unauthorized' });
      const [isValid, data] = await FilesController.validateFile(req);
      if (!isValid) return res.status(400).send(data);
      if (data.type === 'folder') delete (data.data);
      data.userId = ObjectId(userId);
      data.parentId = data.parentId === undefined ? 0 : ObjectId(data.parentId);
      if (data.type === 'folder') {
        const fileId = await dbClient.saveFile(data);
        data.id = fileId;
        delete (data._id);
        return res.status(201).send(data);
      }
      await FilesController.createDir(folder);
      const fileName = uuidv4();
      const filePath = folder.endsWith('/') ? folder + fileName : `${folder}/${fileName}`;
      const buff = FilesController.decodedeBase64toBinaryFile(data.data);
      await FilesController.saveToPath(buff, filePath);
      data.localPath = filePath;
      const reply = {
        userId: data.userId,
        name: data.name,
        type: data.type,
        isPublic: data.isPublic,
        parentId: data.parentId,
        localPath: data.localPath,
      };
      const fileId = await dbClient.saveFile(reply);
      fileQueue.add({ fileId, userId }, { removeOnComplete: true });
      reply.id = fileId;
      reply.parentId = reply.parentId.toString();
      delete (reply.localPath);
      delete (reply._id);
      return res.status(201).send(reply);
    }
    return res.status(500).send({ error: 'storage unavailable' });
  }

  static async getShow(req, res) {
    if (redisClient.isAlive() && dbClient.isAlive()) {
      const fileId = req.params.id;
      const token = req.get('X-Token');
      const userId = await redisClient.get(`auth_${token}`);
      const user = await UsersController.getUser(userId);
      if (!user) return res.status(401).send({ error: 'Unauthorized' });
      const file = await dbClient.findByColAndFilter('files', '_id', fileId);
      if (!file) return res.status(404).send({ error: 'Not found' });
      if (file.userId.toString() !== user._id.toString()) {
        return res.status(404).send({ error: 'Not found' });
      }
      file.id = file._id;
      delete (file._id);
      delete (file.localPath);
      return res.send(file);
    }
    return res.status(500).send({ error: 'storage unavailable' });
  }

  static async putPublish(req, res) {
    if (redisClient.isAlive() && dbClient.isAlive()) {
      const [found, resp] = await FilesController.getFileByIdAndUserId(req);
      if (!found) {
        if (resp.error === 'Not found') return res.status(404).send(resp);
        return res.status(401).send(resp);
      }
      const parsedResp = FilesController.serializeFile(resp);
      parsedResp.isPublic = true;
      await dbClient.updateOne('files',
        { _id: ObjectId(parsedResp.id) }, { $set: { isPublic: true } });
      return res.send(parsedResp);
    }
    return res.status(500).send({ error: 'storage unavailable' });
  }

  static async putUnPublish(req, res) {
    if (redisClient.isAlive() && dbClient.isAlive()) {
      const [found, resp] = await FilesController.getFileByIdAndUserId(req);
      if (!found) {
        if (resp.error === 'Not found') return res.status(404).send(resp);
        return res.status(401).send(resp);
      }
      const parsedResp = FilesController.serializeFile(resp);
      parsedResp.isPublic = false;
      await dbClient.updateOne('files',
        { _id: ObjectId(parsedResp.id) }, { $set: { isPublic: false } });
      return res.send(parsedResp);
    }
    return res.status(500).send({ error: 'storage unavailable' });
  }

  static async getFile(req, res) {
    if (redisClient.isAlive() && dbClient.isAlive()) {
      const fileId = req.params.id;
      const { size } = req.query;
      const file = await FilesController.getFileById(fileId);
      if (!file) return res.status(404).send({ error: 'Not found' });
      const resp = await FilesController.getFileByIdAndUserId(req);
      const found = resp[0];
      if (!found && !file.isPublic) return res.status(404).send({ error: 'Not found' });
      if (file.type === 'folder') {
        return res.status(400).send(
          { error: "A folder doesn't have content" },
        );
      }
      let content = null;
      if (!size) {
        content = await FilesController.readFromPath(file.localPath);
      } else {
        const PATH = `${file.localPath}_${size.toString()}`;
        content = await FilesController.readFromPath(PATH);
      }
      if (content === null) return res.status(404).send({ error: 'Not found' });
      const mimeT = mime.contentType(file.name);
      if (mimeT) {
        res.set('Content-Type', mimeT);
      } else {
        res.set('Content-Type', 'text/plain');
      }
      return res.send(content);
    }
    return res.status(500).send({ error: 'storage unavailable' });
  }

  static async getFileByIdAndUserId(req) {
    const fileId = req.params.id;
    const token = req.get('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    const user = await UsersController.getUser(userId);
    if (!user) return [false, { error: 'Unauthorized' }];
    const file = await dbClient.findByColAndFilter('files', '_id', fileId);
    if (!file) return [false, { error: 'Not found' }];
    if (file.userId.toString() !== user._id.toString()) {
      return [false, { error: 'Not found' }];
    }
    return [true, file];
  }

  static async getFileByUserIdAndFileId(userId, fileId) {
    if (!userId || !fileId) return [false, null];
    const user = await UsersController.getUser(userId);
    if (!user) return [false, null];
    const file = await dbClient.findByColAndFilter('files', '_id', fileId);
    if (!file) return [false, null];
    if (file.userId.toString() !== user._id.toString()) {
      return [false, null];
    }
    return [true, file];
  }

  static serializeFile(fileObj) {
    const file = { ...fileObj };
    file.id = file._id;
    delete (file._id);
    delete (file.localPath);
    return file;
  }

  static async getIndex(req, res) {
    if (redisClient.isAlive() && dbClient.isAlive()) {
      const token = req.get('X-Token');
      const userId = await redisClient.get(`auth_${token}`);
      const user = await UsersController.getUser(userId);
      if (!user) return res.status(401).send({ error: 'Unauthorized' });
      let parentId = req.query.parentId || 0;
      let page = Number(req.query.page) || 0;
      page = page ? page * 20 : page;
      if (parentId) {
        try {
          parentId = ObjectId(parentId);
        } catch (err) {
          if (err) parentId = Number(req.query.parentId) || 0;
        }
      }
      const cursor = dbClient.filesCollection.aggregate([
        { $match: { userId: ObjectId(user._id), parentId } },
        { $skip: page },
        { $limit: 20 },
      ]);
      const files = await cursor.toArray();
      for (let i = 0; i < files.length; i += 1) {
        const doc = files[i];
        doc.id = doc._id;
        delete (doc._id);
        delete (doc.localPath);
      }
      cursor.close();
      return res.send(files);
    }
    return res.status(500).send({ error: 'storage unavailable' });
  }

  static async validateFile(req) {
    const validTypes = ['folder', 'file', 'image'];
    const {
      name, type, parentId, data,
    } = req.body;
    let { isPublic } = req.body;
    isPublic = isPublic !== undefined ? isPublic : false;
    if (!name) return [false, { error: 'Missing name' }];
    if (!type) return [false, { error: 'Missing type' }];
    if (!(validTypes.includes(type))) return [false, { error: 'Missing type' }];
    if (!data && type !== 'folder') return [false, { error: 'Missing data' }];
    if (parentId) {
      const parent = await dbClient.findByColAndFilter('files', '_id', parentId);
      if (!parent) return [false, { error: 'Parent not found' }];
      if (parent.type !== 'folder') {
        return [false, { error: 'Parent is not a folder' }];
      }
    }
    return [true, {
      name, type, parentId, isPublic, data,
    }];
  }

  static decodedeBase64toBinaryFile(encoding) {
    const buffer = Buffer.from(encoding, 'base64');
    return buffer;
  }

  static async saveToPath(buffer, path) {
    return open(path, 'w').then((fd) => {
      fd.write(buffer);
      fd.close();
    });
  }

  static async readFromPath(path) {
    return open(path, 'r').then(async (fd) => {
      const res = await fd.readFile();
      fd.close();
      return res;
    })
      .catch((err) => {
        if (err) return null;
        return null;
      });
  }

  static async createDir(path) {
    return mkdir(path, { recursive: true });
  }

  static async getFileById(fileId) {
    const file = await dbClient.findByColAndFilter('files', '_id', fileId);
    return file;
  }
}
