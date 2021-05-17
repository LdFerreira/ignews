import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/client';
import { query as q } from 'faunadb';
import { stripe } from '../../services/stripe';
import fauna from '../../services/fauna';

type User = {
  ref: {
    id: string;
  };
  data: {
    // eslint-disable-next-line camelcase
    stripe_costumer_id: string;
  };
};

export const Subscriber = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const session = await getSession({ req });

    const user = await fauna.query<User>(
      q.Get(q.Match(q.Index('user_by_email'), q.Casefold(session.user.email))),
    );

    let costumerId = user.data.stripe_costumer_id;
    if (!costumerId) {
      const stripeCustomer = await stripe.customers.create({
        email: session.user.email,
      });

      await fauna.query(
        q.Update(q.Ref(q.Collection('users'), user.ref.id), {
          data: {
            stripe_costumer_id: stripeCustomer.id,
          },
        }),
      );

      costumerId = stripeCustomer.id;
    }

    const stripeCheckoutSession = await stripe.checkout.sessions.create({
      customer: costumerId,
      payment_method_types: ['card'],
      billing_address_collection: 'required',
      line_items: [{ price: 'price_1IeV8yJpViHnoU3v9zPrXXsW', quantity: 1 }],
      mode: 'subscription',
      allow_promotion_codes: true,
      success_url: process.env.STRIPE_SUCCESS_URL,
      cancel_url: process.env.STRIPE_CANCEL_URL,
    });

    return res.status(200).json({ sessionId: stripeCheckoutSession.id });
  }
  res.setHeader('Allow', 'POST');
  return res.status(405).end('Method not allowed');
};
