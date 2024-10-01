import assert from 'assert';
import dbClient from '../utils/db';
import { ObjectId } from 'mongodb';

function waitConnection() {
  return new Promise((resolve, reject) => {
    let i = 0;
    async function repeatFct() {
      setTimeout(async () => {
        i += 1;
        if (i >= 10) {
          reject();
        } else if (!dbClient.isAlive()) {
          await repeatFct();
        } else {
          resolve();
        }
      }, 30);
    }
    repeatFct();
  });
}

after(() => {
  dbClient.db.dropDatabase();
});

describe('test dbClient', () => {
  it('should save a user', async () => {
    await waitConnection();
    const userCont = await dbClient.usersCollection.find({}).toArray();
    const savedUserId = await dbClient.saveUser({ name: 'to_find', email: 'to_find@y.com' });
    const afterSave = await dbClient.usersCollection.find({}).toArray();
    assert(afterSave.length > userCont.length);
  });

  it('should find a user', async () => {
    await waitConnection();
    const user = await dbClient.findByColAndFilter('users', 'email', 'not exist');
    assert(!user);
    await dbClient.saveUser({ name: 'to_find', email: 'to_find@y.com' });
    const afterSave = await dbClient.findByColAndFilter('users', 'email', 'to_find@y.com');
    assert(afterSave !== null);
  });

  it('should test find', async () => {
    await waitConnection();
    const users = await dbClient.find('users', 'email', 'not exist');
    assert(!users.length);
    await dbClient.saveUser({ name: 'to_find', email: 'to_find@y.com' });
    const afterSave = await dbClient.find('users', 'email', 'to_find@y.com');
    assert(afterSave !== null);
  });

  it('should test find with null key and {}', async () => {
    await waitConnection();
    const beforeInsert = await dbClient.find('users', null, {});
    await dbClient.saveUser({ name: 'to_find', email: 'to_find@y.com' });
    const afterInsert = await dbClient.find('users', null, {});
    assert(afterInsert.length === beforeInsert.length + 1);
  });

  it('should test updateOne users collection', async () => {
    await waitConnection();
    let id = await dbClient.saveUser({ name: 'to_find', email: 'to_find@y.com' });
    let beforeUpdate = await dbClient.findByColAndFilter('users', '_id', id);
    await dbClient.updateOne('users', {_id: ObjectId(id)}, {$set: {name: 'new_name'}})
    let afterUpdate = await dbClient.findByColAndFilter('users', '_id', id)
    assert(afterUpdate.name === 'new_name');
    assert(afterUpdate.name !== beforeUpdate.name)
  });

  it('should test updateOne files collection', async () => {
    await waitConnection();
    let id = await dbClient.saveFile({ name: 'file 1'});
    let beforeUpdate = await dbClient.findByColAndFilter('files', '_id', id);
    await dbClient.updateOne('files', {_id: ObjectId(id)}, {$set: {name: 'new_name'}})
    let afterUpdate = await dbClient.findByColAndFilter('files', '_id', id)
    assert(afterUpdate.name === 'new_name');
    assert(afterUpdate.name !== beforeUpdate.name)
  });

});
