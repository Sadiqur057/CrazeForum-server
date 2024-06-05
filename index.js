const express = require('express');
require('dotenv').config()
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.x7pm4nr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();


    const DB = client.db('CrazeForumDB');
    const postCollection = DB.collection('posts');
    const userCollection = DB.collection('users');
    const commentCollection = DB.collection('comments');
    const announcementCollection = DB.collection('announcements')
    const tagCollection = DB.collection('tags')
    // const reportCollection = DB.collection('reports')


    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1hr' })
      res.send({ token })
    })

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      const token = req.headers.authorization.split(' ')[1]
      console.log(token)
      if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        console.log(req.decoded)
        next()
      })
    }


    const verifyAdmin = async (req, res, next) => {
      console.log(req.decoded)
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query)
      const isAdmin = user?.isAdmin === true;
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" })
      }
      next()
    }


    // user related api

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      // insert email if user does not exists
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query)
      console.log('user', existingUser)
      if (existingUser) {
        return res.send({ message: "Existing User", insertedId: null });
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    app.put('/user/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id)
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          'isAdmin': true
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc)
      console.log(result)
      res.send(result)
    })




    // post related api
    app.get('/posts', async (req, res) => {
      const result = await postCollection.find().toArray();
      res.send(result)
    })

    app.get('/post/:id', async (req, res) => {
      const id = req.params.id;
      console.log("id", id)
      const query = { _id: new ObjectId(id) }
      const result = await postCollection.findOne(query);
      // console.log('result', result)
      res.send(result)
    })

    app.get('/posts/:email', async (req, res) => {
      const email = req.params.email;
      console.log(email)
      const query = { author_email: email }
      const result = await postCollection.find(query).toArray();
      // console.log('result', result)
      res.send(result)
    })

    app.post('/post', async (req, res) => {
      const data = req.body;
      const result = await postCollection.insertOne(data)
      res.send(result)
    })

    app.post('/post/upvote/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const update = req.body.update;
      console.log("upvote", id, update)
      const updatedDoc = {
        $inc: { up_vote_count: update }
      }
      const result = await postCollection.updateOne(filter, updatedDoc)
      res.send(result)
      // console.log(id, result)
    })

    app.post('/post/downvote/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const update = req.body.update;
      console.log("downvote", id, update)
      const updatedDoc = {
        $inc: { down_vote_count: update }
      }
      const result = await postCollection.updateOne(filter, updatedDoc)
      res.send(result)
      // console.log(id, result)
    })

    app.get('/postByTag/:tag', async (req, res) => {
      const tag = req.params.tag;
      console.log(tag)

      if (tag === "all") {
        const result = await postCollection.find().toArray()
        console.log(result)
        return res.send(result)
      }

      const filter = { tag: tag }
      const result = await postCollection.find(filter).toArray()
      res.send(result)
    })

    app.delete('/post/:id',async(req,res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}
      const result = await postCollection.deleteOne(filter)
      res.send(result)
    })

    // comments related api

    app.get('/comments', async (req, res) => {
      const result = await commentCollection.find().toArray()
      res.send(result)
    })

    app.post('/comment', async (req, res) => {
      const data = req.body;
      const result = await commentCollection.insertOne(data)
      res.send(result)
    })

    app.put('/comment', async (req, res) => {
      const id = req.query?.id;
      const feedback = req.query?.feedback
      console.log(id, feedback)
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          'isReported': true,
          'feedback': feedback
        }
      }
      const result = await commentCollection.updateOne(filter, updatedDoc)
      console.log(result)
      res.send(result)
    })

    app.get('/reportedComments', async (req, res) => {
      const query = { isReported: true };
      const result = await commentCollection.find(query).toArray()
      res.send(result)
    })

    app.delete('/comment/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const result = await commentCollection.deleteOne(filter)
      res.send(result)
    })

    // announcement related api
    app.post('/announcement', async (req, res) => {
      const data = req.body;
      const result = await announcementCollection.insertOne(data)
      res.send(result)
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("App is running")
})

app.listen(port, () => {
  console.log(`running on http://localhost:${port}`)
})