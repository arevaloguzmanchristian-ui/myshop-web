// Appwrite SDK — M.Y. Shop
// Endpoint: nyc.cloud.appwrite.io | Project: 6a3c1a220036837612a7

import { Client, Account, Databases } from "appwrite";

const client = new Client()
    .setEndpoint("https://nyc.cloud.appwrite.io/v1")
    .setProject("6a3c1a220036837612a7");

const account = new Account(client);
const databases = new Databases(client);

export { client, account, databases };
