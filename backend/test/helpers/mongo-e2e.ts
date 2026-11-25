import * as os from 'os';
import mongoose, { Connection } from 'mongoose';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

/**
 * Opens a throw-away database on a local MongoDB replica set (transactions need one).
 * Only local hosts are accepted, so a MONGODB_URL pointing at Atlas can never be used,
 * and a missing / standalone server fails the suite instead of skipping it.
 */
export const connectTestDatabase = async (
  prefix: string,
): Promise<Connection> => {
  const baseUri = process.env.MONGODB_URL;
  if (!baseUri) {
    throw new Error('MONGODB_URL is not defined in environment');
  }
  const url = new URL(baseUri);
  if (!LOCAL_HOSTS.includes(url.hostname)) {
    throw new Error('This suite only runs against a local MongoDB');
  }
  url.pathname = `/${prefix}_${Date.now()}`;

  const connection = await mongoose
    .createConnection(url.toString(), {
      serverSelectionTimeoutMS: 10000,
      // Driver >= 7.6 loads 'os' with import(), which Jest does not support without a flag
      runtimeAdapters: { os },
    })
    .asPromise();
  const hello = await connection.db!.admin().command({ hello: 1 });
  if (!hello.setName) {
    await connection.close();
    throw new Error('MongoDB must run as a replica set (--replSet)');
  }
  return connection;
};
