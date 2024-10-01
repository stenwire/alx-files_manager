import imageThumbnail from 'image-thumbnail';
import Queue from 'bull';
const fileQueue = new Queue('fileQueue');
export { fileQueue };

const userQueue = new Queue('userQueue');
export { userQueue };

fileQueue.on('error', (err) => console.log(err));
fileQueue.on('completed', (job, res) => console.log('comleted file job', job.id, res));
fileQueue.on('failed', (job, err) => console.log('failed file job', job.id, err));

userQueue.on('error', (err) => console.log(err));
userQueue.on('completed', (job, res) => console.log('comleted user job', job.id, res));
userQueue.on('failed', (job, err) => console.log('failed user job', job.id, err));

function waitConnection(dbClient) {
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
      }, 10);
    }
    repeatFct();
  });
}

async function fileWorker(job) {
  const mod = await import('./controllers/FilesController')
  const FilesController = mod.default
  const dbClient = mod.dbClient
  if (!dbClient.isAlive()) await waitConnection(dbClient)
  const {fileId, userId} = job.data
  if (!fileId) return Promise.reject('Missing fileId')
  if (!userId) return Promise.reject('Missing userId')
  const [found, file] = await FilesController.getFileByUserIdAndFileId(userId, fileId);
  if (!found)  return Promise.reject('File not found')
  const opt500 = {width: 500}
  const opt250 = {width: 250}
  const opt100 = {width: 100}
  const optList = [[opt500, '_500'], [opt250, '_250'], [opt100, '_100']]
  optList.forEach(async (option) => {
    try {
      const thumbnail = await imageThumbnail(file.localPath, option[0])
      await FilesController.saveToPath(thumbnail, file.localPath + option[1])
    } catch(err) {
      return Promise.reject('Failed job', job.id)
    }
  })
  return Promise.resolve('success')
}

async function userWorker(job) {
  const mod = await import('./controllers/UsersController')
  const usersController = mod.default
  const dbClient = mod.dbClient
  if (!dbClient.isAlive()) await waitConnection(dbClient)
  const {userId} = job.data
  if (!userId) return Promise.reject('Missing userId')
  const user = await usersController.getUser(userId);
  if (!user)  return Promise.reject('File not found')
  console.log(`Welcome ${user.email}!`) 
  return Promise.resolve('success')
}

fileQueue.process(1, fileWorker);
userQueue.process(1, userWorker);
