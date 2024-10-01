import assert from 'assert';
import dbClient from '../utils/db';

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
    const savedUserId = await dbClient.saveUser({ name: 'to_find', email: 'to_find@y.com' });
    const afterSave = await dbClient.findByColAndFilter('users', 'email', 'to_find@y.com');
    assert(afterSave !== null);
    // done()
  });
});
