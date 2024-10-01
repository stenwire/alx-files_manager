const Queue = require('bull');

const videoQueue1 = new Queue('video transcoding');
const videoQueue2 = new Queue('video transcoding');

videoQueue1.process((job, done) => {
  console.log(job.data)
  done()
})

videoQueue1.on('completed', async (job, res) => {
  console.log(job.id, 'job done')
  // videoQueue1.close()
  await close(videoQueue1, videoQueue2)
})

videoQueue2.on('completed', async (job, res) => {
  console.log(job.id, 'job done')
  // videoQueue2.close()
  // await close(videoQueue1, videoQueue2)
})

videoQueue1.on('error', (err) => {
  console.log(err)
})

videoQueue2.on('error', (err) => {
  console.log(err)
})

videoQueue2.add({data: 'vq 2'})
videoQueue1.add({data: 'vq 1'})
videoQueue2.add({data: 'vq 2: 2'})

async function close(q1, q2) {
  return new Promise((res) => {
    setTimeout(() => {
      q1.close()
      q2.close()
      res('done')
    }, 2000)
  })
}
