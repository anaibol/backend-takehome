import fastify from 'fastify';
import { User, UserTaskData } from '../../share';
import Bull from 'bull';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

export class UsersJobData extends UserTaskData {
  createdOn!: Date;
}

const getRandomDate = (start: Date, end: Date): Date => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

const changeTimeZone = (date: Date, timeZone: string): Date => {
  if (typeof date === 'string') {
    return new Date(
      new Date(date).toLocaleString('en-US', {
        timeZone,
      }),
    );
  }

  return new Date(
    date.toLocaleString('en-US', {
      timeZone,
    }),
  );
}

const isDatePassed = (date: Date): boolean => {
  return date < new Date();
}

const instance: AxiosInstance = axios.create({
  baseURL: "http://127.0.0.1:8080/",
  timeout: 1000,
  headers: { "content-type": "application/json" },
});

const queue = new Bull('users', 'redis://default:redispw@localhost:6379');

queue.process('users', function (job: Bull.Job<UsersJobData>): Promise<void> | Promise<AxiosResponse<UserTaskData>> {
  console.log('Processing job', job.data, job.data.createdOn);

  if (isDatePassed(new Date(job.data.scheduledDate))) return Promise.resolve()

  return instance.post<UserTaskData>('/', job.data)
});

queue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed with result ${result}`);
})

queue.on('error', (error) => {
  console.log('Queue error:', error);
})

const createJob = (data: UserTaskData, options: Bull.JobOptions): Promise<Bull.Job<User>> => {
  const jobData = {
    ...data,
    createdOn: changeTimeZone(new Date(), data.timeZone),
  }

  console.log((new Date()).toISOString(), 'Creating job', jobData);

  return queue.add('users', jobData, {
    priority: 0,
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    ...options
  });
};

const server = fastify();

server.post<{
  Body: User,
  Reply: {
    success: boolean
  }
}>('/user', async (request, reply) => {
  const { uid, timeZone } = request.body;

  const firstNotificationDelayInMs = 120000
  const firstNotificationDate = new Date().setMilliseconds(new Date().getMilliseconds() + firstNotificationDelayInMs);

  await createJob({
    uid, timeZone, scheduledDate: new Date(firstNotificationDate).toISOString()
  }, {
    jobId: uid,
    delay: firstNotificationDelayInMs
  });

  const userDate = changeTimeZone(new Date(), timeZone);

  const nineteen = new Date(userDate.getFullYear(), userDate.getMonth(), userDate.getDate(), 19, 0, 0, 0);
  const twentyone = new Date(userDate.getFullYear(), userDate.getMonth(), userDate.getDate(), 21, 0, 0, 0);

  const scheduledDate = getRandomDate(nineteen, twentyone)

  if (isDatePassed(nineteen)) return

  await createJob({
    uid, timeZone, scheduledDate: scheduledDate.toISOString()
  }, {
    jobId: uid,
    // Substract the current time from the desired time to skip if the time has already passed
    delay: (+(scheduledDate) - +(new Date()))
  });

  reply.code(201).send();

  reply.send({
    success: true
  })
});

(async () => {
  try {
    await server.listen(3001, "0.0.0.0")
    console.log("Scheduler listening on port 3001");
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
})();