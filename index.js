const express = require('express');
require('dotenv').config()
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

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
    // await client.connect();


    const DB = client.db('CrazeForumDB');
    const postCollection = DB.collection('posts');
    const userCollection = DB.collection('users');
    const commentCollection = DB.collection('comments');
    const announcementCollection = DB.collection('announcements')
    const tagCollection = DB.collection('tags')
    const paymentCollection = DB.collection('payments')


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



    // admin related api

    app.get('/user/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      console.log("email", email)
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.isAdmin === true
      }
      res.send({ admin })
    })


    // user related api

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })

    app.get('/user/', verifyToken, verifyAdmin, async (req, res) => {
      const username = req.query.username || ""
      const page = parseInt(req.query.page) || 0
      console.log('api called', username, page)
      const pipeline = [];
      const countPipeline = []

      if (username !== "") {
        pipeline.push({
          $match: { name: { $regex: username, $options: 'i' } }
        })
        countPipeline.push({
          $match: { name: { $regex: username, $options: 'i' } }
        })
      } else {
        pipeline.push(
          {
            $sort: { _id: -1 }
          }
        )
      }
      countPipeline.push({ $count: "count" })

      const [countResult] = await userCollection.aggregate(countPipeline).toArray();
      const count = countResult ? countResult.count : 0;

      pipeline.push(
        { $skip: page * 10 },
        { $limit: 10 }
      );

      const result = await userCollection.aggregate(pipeline).toArray();
      // console.log(result)
      res.send({ count, result });
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      // insert email if user does not exists
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: "Existing User", insertedId: null });
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    app.put('/editProfile/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const bio = req.body?.bio || ""
      const name = req.body?.name
      const filter = { email: email }
      const updatedDoc = {
        $set: {
          bio: bio,
          name: name
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc)
      console.log(result)
      res.send(result)
    })

    app.get('/userInfo/:email',verifyToken,async(req,res)=>{
      const email = req.params.email
      const filter = { email: email }
      const result = await userCollection.findOne(filter)
      console.log(result)
      res.send(result)
    })


    app.put('/user/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          'isAdmin': true
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc)
      // console.log(result)
      res.send(result)
    })

    app.put('/user/badge/:email', async (req, res) => {
      const email = req.params.email;
      const filter = { email: email }
      const updatedDoc = {
        $set: {
          badge: 'gold'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc)
      // console.log(result)
      res.send(result)
    })

    app.get('/user/badge/:email', async (req, res) => {
      const email = req.params.email;
      const filter = { email: email }
      const result = await userCollection.findOne(filter, { projection: { badge: 1 } })
      // console.log(result)
      res.send(result)
    })


    // payments related api

    // payment Intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments', async (req, res) => {
      const data = req.body;
      const result = await paymentCollection.insertOne(data);
      // console.log(result)
      res.send(result)
    })

    // post related api
    app.get('/posts', async (req, res) => {
      const result = await postCollection.find().sort({ posted_time: -1 }).toArray();
      res.send(result)
    })

    app.get('/post/:id', async (req, res) => {
      const id = req.params.id;
      // console.log("id", id)
      const query = { _id: new ObjectId(id) }
      const result = await postCollection.findOne(query);
      // console.log('result', result)
      res.send(result)
    })

    app.get('/posts/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const page = req.query?.page;
      console.log(page)

      const query = { author_email: email }
      const userPostCounts = await postCollection.countDocuments(query);
      const result = await postCollection.find(query).skip(page * 10).limit(10).sort({ _id: -1 }).toArray();
      res.send({ userPostCounts, result });
    })

    app.post('/post', verifyToken, async (req, res) => {
      const data = req.body;
      const result = await postCollection.insertOne(data)
      res.send(result)
    })

    app.post('/post/upvote/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const update = req.body.update;
      // console.log("upvote", id, update)
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
      // console.log("downvote", id, update)
      const updatedDoc = {
        $inc: { down_vote_count: update }
      }
      const result = await postCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })



    app.get('/postByTag', async (req, res) => {
      const tag = req.query?.tag || "";
      const sorted = req.query?.sorted === 'true';
      const page = parseInt(req.query.page) || 0
      console.log(tag, sorted, page)
      const pipeline = [];
      const countPipeline = [];

      if (tag !== "") {
        pipeline.push({
          $match: { tag: { $regex: tag, $options: 'i' } }
        });
        countPipeline.push({
          $match: { tag: { $regex: tag, $options: 'i' } }
        });
      }

      if (sorted) {
        pipeline.push(
          {
            $addFields: {
              voteDifference: {
                $subtract: ['$up_vote_count', '$down_vote_count']
              }
            }
          },
          {
            $sort: {
              voteDifference: -1
            }
          }
        )
      } else {
        pipeline.push(
          {
            $sort:
              { posted_time: -1 }
          }
        )
      }

      countPipeline.push({ $count: "count" });

      const [countResult] = await postCollection.aggregate(countPipeline).toArray();
      const count = countResult ? countResult.count : 0;


      pipeline.push(
        { $skip: page * 5 },
        { $limit: 5 }
      );

      const result = await postCollection.aggregate(pipeline).toArray();
      console.log(result)
      res.send({ count, result });

      // const result = await postCollection.aggregate(pipeline).skip(page * 5).limit(5).toArray();
      // res.send(result)
    })

    app.delete('/post/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const result = await postCollection.deleteOne(filter)
      res.send(result)
    })

    // comments related api

    app.get('/comments/:id', async (req, res) => {
      const postId = req.params.id
      const page = req.query.page;
      console.log('current page', page)
      const filter = { post_id: postId }
      const commentCounts = await commentCollection.countDocuments(filter);
      const result = await commentCollection.find(filter).skip(page * 10).limit(10).sort({ _id: -1 }).toArray()
      res.send({ commentCounts, result });
    })

    app.post('/comment', async (req, res) => {
      const data = req.body;
      const result = await commentCollection.insertOne(data)
      res.send(result)
    })

    app.put('/comment', async (req, res) => {
      const id = req.query?.id;
      const feedback = req.query?.feedback
      // console.log(id, feedback)
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          'isReported': true,
          'feedback': feedback
        }
      }
      const result = await commentCollection.updateOne(filter, updatedDoc)
      // console.log(result)
      res.send(result)
    })

    app.get('/reportedComments', verifyToken, verifyAdmin, async (req, res) => {
      const page = req.query.page;
      console.log('current page', page)
      const query = { isReported: true };
      const reportedCommentsCount = await commentCollection.countDocuments(query)
      const result = await commentCollection.find(query).skip(page * 10).limit(10).toArray()
      res.send({ result, reportedCommentsCount })
    })

    app.delete('/comment/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const result = await commentCollection.deleteOne(filter)
      res.send(result)
    })

    // announcement related api
    app.post('/announcement', verifyToken, verifyAdmin, async (req, res) => {
      const data = req.body;
      const result = await announcementCollection.insertOne(data)
      res.send(result)
    })
    app.get('/announcements', async (req, res) => {
      const result = await announcementCollection.find().toArray()
      res.send(result)
    })

    // stats related api
    app.get('/stats', verifyToken, async (req, res) => {
      const postCounts = await postCollection.estimatedDocumentCount()
      const userCounts = await userCollection.estimatedDocumentCount()
      const commentCounts = await commentCollection.estimatedDocumentCount()
      res.send({ postCounts, userCounts, commentCounts })
    })


    // tags related api
    app.get('/tags', async (req, res) => {
      const result = await tagCollection.find({ tagName: { $ne: "all" } }).toArray();
      res.send(result)
    })

    app.post('/tags', async (req, res) => {
      const data = req.body;
      const result = await tagCollection.insertOne(data)
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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