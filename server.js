const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const app = express();
const PORT = process.env.PORT || 3001;
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());
app.use(express.static("client"));
require('dotenv').config()


/*******************
 * Setup Stripe and route which will send charge to payment gateway
 *******************/
const stripe = require("stripe")(
  process.env.StripeSecretKey
);
app.get('/', function (req, res) {
  res.send('GET request to the homepage')
});

/*******************
 * Setup Salesforce connection and REST API routes using jsforce
 *******************/
var jsforce = require('jsforce');
var conn = new jsforce.Connection();

/*******************
 * Method for Subscription
 *******************/
app.post("/subscribe", (req, res) => {
  var PlanName = req.body.planId;
  var amountVal = req.body.amtDol;
  console.log(amountVal);
  let subscrip, cerds;
  const customer = stripe.customers.create({
    email: req.body.stripeEmail,
    source: req.body.stripeToken
  })
    .then(customer => {
      stripe.customers.listCards(
        `${customer.id}`,
        function (err, cards) {
          if (err) {
            console.log("Couldn't fetch cards for customer: " + `${customer.id}`);
            res
              .status(502)
              .send(fail(err));
            return console.log(err)
          } else {
            console.log("Cards fetched, for : " + `${customer.id}`);
            console.log("These are the cards : " + `${cards}`);
            cerds = cards;
          }
        })
      stripe.subscriptions.create({
        customer: `${customer.id}`,
        items: [{
          plan: PlanName
        }]
      }, function (err, subscription) {
        if (err) {
          return console.log(err);
        }
        console.log('Card>>>>' + res);
        console.log('subscription has been processed !');
        console.log(subscription);
        subscrip = subscription
      })
      setTimeout(function () {
        insertAccount(req.body, subscrip, cerds, amountVal);
      }, 3000);
    })
    .then(charge => res.redirect('/'))
});


/*******************
 * Inserting Account
 *******************/
var insertAccount = (data, subdata, carddata, amt) => {
  conn.login(process.env.SFusername, process.env.SFusername, function (err, res) {
    console.log('&&&&&&' + JSON.stringify(carddata));
    console.log('&&&&&&' + JSON.stringify(subdata));
    var accId = '';
    var opptyId = '';
    if (err) {
      return console.error(err);
    }
    conn.sobject("Account").create({
      Name: `${data.stripeBillingName}`,
      BillingStreet: `${data.stripeBillingAddressLine1}`,
      BillingCity: `${data.stripeBillingAddressCity}`,
      BillingState: `${data.stripeBillingAddressState}`,
      BillingPostalCode: `${data.stripeBillingAddressZip}`,
      BillingCountry: `${data.stripeBillingAddressCountry}`,
      Email__c: `${data.stripeEmail}`
    }, function (err, ret) {
      if (err || !ret.success) {
        return console.error(err, ret);
      }
      console.log(">>>>>Created account record with id : " + ret.id);
      console.log(">>>>>Acc Details : " + JSON.stringify(ret));
      accId = ret.id;

      /*******************
       * Inserting Oppty
       *******************/
      conn.sobject("Opportunity").create({
        Name: `${data.stripeBillingName} ${new Date()}`,
        AccountId: accId,
        Type: `Subscription`,
        Status__c: `Pledged`,
        StageName: `Pledged`,
        CloseDate: new Date()
      }, function (err, ret) {
        if (err || !ret.success) {
          return console.error(err, ret);
        }
        opptyId = ret.id;
        /*******************
         * Inserting Payment History
         *******************/
        conn.sobject("Payment_History__c").create({
          //Name: `${data.stripeBillingName}`,
          Opportunity__c: `${opptyId}`,
          Donation_Type__c: `Subscription`,
          Mode_of_Payment__c: `Credit Card`,
          Name_on_the_card__c: data.stripeBillingName,
          Payment_Status__c: `Success`,
          Amount__c: amt,
          Card_Number__c: carddata.data[0].last4,
          Expiry_Date__c: `${carddata.data[0].exp_month}/${carddata.data[0].exp_year}`,
          Transaction_Ref_Number__c: carddata.data[0].customer,
          Customer_Id__c: carddata.data[0].customer,
          Card_Id__c: carddata.data[0].id,
          Date_of_Payment__c: new Date()
        }, function (err, ret) {
          if (err || !ret.success) {
            return console.error(err, ret);
          }
          console.log(">>>>>Created PaymentHistory__c record with id : " + ret.id);
          console.log(">>>>>PH Details : " + JSON.stringify(ret));
        });
        console.log(">>>>>Created opportunity record with id : " + ret.id);
        console.log(">>>>>Oppty Details : " + JSON.stringify(ret));
        console.log(">>>>>OpptyId>>>>> : " + ret.id);
        return ret.id;
      });

    });

  });
}



app.listen(PORT, function () {
  console.log(`🌎  ==> API Server now listening on PORT ${PORT}!`);
});