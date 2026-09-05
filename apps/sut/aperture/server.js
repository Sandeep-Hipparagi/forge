import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "aperture-secret-key-for-testing",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(join(__dirname, "public")));

const users = new Map([
  ["user@example.com", { password: "password123", name: "Test User" }]
]);

const products = [
  { id: 1, name: "Aperture T-Shirt", price: 29.99, description: "Comfortable cotton t-shirt" },
  { id: 2, name: "Aperture Hoodie", price: 49.99, description: "Warm fleece hoodie" },
  { id: 3, name: "Aperture Mug", price: 12.99, description: "Ceramic coffee mug" },
  { id: 4, name: "Aperture Sticker Pack", price: 4.99, description: "Pack of 5 vinyl stickers" }
];

let mutationMode = "none";

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login?redirect=" + encodeURIComponent(req.originalUrl));
  }
  next();
}

function getCart(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Aperture - Home</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .nav a { margin-right: 15px; text-decoration: none; color: #0066cc; }
        .nav a:hover { text-decoration: underline; }
        .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
        .product { border: 1px solid #ddd; border-radius: 8px; padding: 15px; }
        .product h3 { margin: 0 0 10px; }
        .price { color: #28a745; font-weight: bold; font-size: 1.2em; }
        .btn { display: inline-block; padding: 8px 16px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; }
        .btn:hover { background: #0052a3; }
        .btn-destructive { background: #dc3545; }
        .btn-destructive:hover { background: #c82333; }
        .cart-count { background: #0066cc; color: white; border-radius: 50%; padding: 2px 8px; font-size: 0.8em; }
        .flash { padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .flash.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .flash.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
      </style>
    </head>
    <body>
      <header class="header">
        <h1><a href="/" style="text-decoration: none; color: inherit;">Aperture</a></h1>
        <nav class="nav">
          <a href="/">Home</a>
          <a href="/products">Products</a>
          <a href="/cart">Cart (<span class="cart-count">${getCart(req).reduce((sum, item) => sum + item.qty, 0)}</span>)</a>
          ${req.session.user ? `<a href="/account">Account</a> <form action="/logout" method="POST" style="display:inline;"><button class="btn" type="submit">Logout</button></form>` : `<a href="/login">Login</a>`}
        </nav>
      </header>
      ${req.session.flash ? `<div class="flash ${req.session.flash.type}">${req.session.flash.message}</div>` : ''}
      <main>
        <h2>Welcome to Aperture</h2>
        <p>Your deterministic test shop for autonomous QA.</p>
        <a href="/products" class="btn">Browse Products</a>
      </main>
    </body>
    </html>
  `);
  delete req.session.flash;
});

app.get("/products", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Aperture - Products</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .nav a { margin-right: 15px; text-decoration: none; color: #0066cc; }
        .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
        .product { border: 1px solid #ddd; border-radius: 8px; padding: 15px; }
        .product h3 { margin: 0 0 10px; }
        .price { color: #28a745; font-weight: bold; font-size: 1.2em; }
        .btn { display: inline-block; padding: 8px 16px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; }
        .btn:hover { background: #0052a3; }
        .cart-count { background: #0066cc; color: white; border-radius: 50%; padding: 2px 8px; font-size: 0.8em; }
        .flash { padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .flash.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .flash.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
      </style>
    </head>
    <body>
      <header class="header">
        <h1><a href="/" style="text-decoration: none; color: inherit;">Aperture</a></h1>
        <nav class="nav">
          <a href="/">Home</a>
          <a href="/products">Products</a>
          <a href="/cart">Cart (<span class="cart-count">${getCart(req).reduce((sum, item) => sum + item.qty, 0)}</span>)</a>
          ${req.session.user ? `<a href="/account">Account</a> <form action="/logout" method="POST" style="display:inline;"><button class="btn" type="submit">Logout</button></form>` : `<a href="/login">Login</a>`}
        </nav>
      </header>
      ${req.session.flash ? `<div class="flash ${req.session.flash.type}">${req.session.flash.message}</div>` : ''}
      <main>
        <h2>Products</h2>
        <div class="product-grid">
          ${products.map(p => `
            <article class="product">
              <h3>${p.name}</h3>
              <p>${p.description}</p>
              <div class="price">$${p.price.toFixed(2)}</div>
              <form action="/cart/add" method="POST" style="margin-top: 10px;">
                <input type="hidden" name="productId" value="${p.id}">
                <button class="btn" type="submit">Add to Cart</button>
              </form>
            </article>
          `).join('')}
        </div>
      </main>
    </body>
    </html>
  `);
  delete req.session.flash;
});

app.post("/cart/add", (req, res) => {
  const productId = parseInt(req.body.productId);
  const product = products.find(p => p.id === productId);
  if (!product) {
    req.session.flash = { type: "error", message: "Product not found" };
    return res.redirect("/products");
  }
  const cart = getCart(req);
  const existing = cart.find(item => item.id === productId);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: productId, name: product.name, price: product.price, qty: 1 });
  }
  req.session.flash = { type: "success", message: `Added ${product.name} to cart` };
  res.redirect("/products");
});

app.get("/cart", (req, res) => {
  const cart = getCart(req);
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Aperture - Cart</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .nav a { margin-right: 15px; text-decoration: none; color: #0066cc; }
        .cart-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee; }
        .cart-item:last-child { border-bottom: none; }
        .item-info { flex: 1; }
        .item-name { font-weight: bold; }
        .item-price { color: #666; }
        .item-qty { display: flex; align-items: center; gap: 10px; }
        .qty-btn { padding: 4px 10px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
        .qty-btn:hover { background: #e0e0e0; }
        .total { text-align: right; font-size: 1.5em; font-weight: bold; margin-top: 20px; }
        .btn { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; font-size: 1em; }
        .btn:hover { background: #0052a3; }
        .btn-destructive { background: #dc3545; }
        .btn-destructive:hover { background: #c82333; }
        .cart-count { background: #0066cc; color: white; border-radius: 50%; padding: 2px 8px; font-size: 0.8em; }
        .flash { padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .flash.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .flash.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
      </style>
    </head>
    <body>
      <header class="header">
        <h1><a href="/" style="text-decoration: none; color: inherit;">Aperture</a></h1>
        <nav class="nav">
          <a href="/">Home</a>
          <a href="/products">Products</a>
          <a href="/cart">Cart (<span class="cart-count">${cart.reduce((sum, item) => sum + item.qty, 0)}</span>)</a>
          ${req.session.user ? `<a href="/account">Account</a> <form action="/logout" method="POST" style="display:inline;"><button class="btn" type="submit">Logout</button></form>` : `<a href="/login">Login</a>`}
        </nav>
      </header>
      ${req.session.flash ? `<div class="flash ${req.session.flash.type}">${req.session.flash.message}</div>` : ''}
      <main>
        <h2>Shopping Cart</h2>
        ${cart.length === 0 ? `
          <p>Your cart is empty.</p>
          <a href="/products" class="btn">Continue Shopping</a>
        ` : `
          <div>
            ${cart.map(item => `
              <div class="cart-item">
                <div class="item-info">
                  <div class="item-name">${item.name}</div>
                  <div class="item-price">$${item.price.toFixed(2)} each</div>
                </div>
                <div class="item-qty">
                  <form action="/cart/update" method="POST" style="display:inline;">
                    <input type="hidden" name="productId" value="${item.id}">
                    <input type="hidden" name="qty" value="${item.qty - 1}">
                    <button class="qty-btn" type="submit" ${item.qty <= 1 ? "disabled" : ""}>-</button>
                  </form>
                  <span>${item.qty}</span>
                  <form action="/cart/update" method="POST" style="display:inline;">
                    <input type="hidden" name="productId" value="${item.id}">
                    <input type="hidden" name="qty" value="${item.qty + 1}">
                    <button class="qty-btn" type="submit">+</button>
                  </form>
                  <form action="/cart/remove" method="POST" style="display:inline; margin-left: 10px;">
                    <input type="hidden" name="productId" value="${item.id}">
                    <button class="btn btn-destructive" type="submit" style="padding: 4px 8px; font-size: 0.8em;">Remove</button>
                  </form>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="total">Total: $${total.toFixed(2)}</div>
          <div style="margin-top: 20px;">
            <a href="/checkout" class="btn">Proceed to Checkout</a>
            <a href="/products" class="btn" style="background: #6c757d; margin-left: 10px;">Continue Shopping</a>
          </div>
        `}
      </main>
    </body>
    </html>
  `);
  delete req.session.flash;
});

app.post("/cart/update", (req, res) => {
  const productId = parseInt(req.body.productId);
  const qty = parseInt(req.body.qty);
  const cart = getCart(req);
  const item = cart.find(i => i.id === productId);
  if (item) {
    if (qty <= 0) {
      const idx = cart.indexOf(item);
      cart.splice(idx, 1);
    } else {
      item.qty = qty;
    }
  }
  res.redirect("/cart");
});

app.post("/cart/remove", (req, res) => {
  const productId = parseInt(req.body.productId);
  const cart = getCart(req);
  const idx = cart.findIndex(i => i.id === productId);
  if (idx >= 0) cart.splice(idx, 1);
  res.redirect("/cart");
});

app.get("/checkout", requireAuth, (req, res) => {
  const cart = getCart(req);
  if (cart.length === 0) {
    req.session.flash = { type: "error", message: "Cart is empty" };
    return res.redirect("/cart");
  }
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Aperture - Checkout</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .nav a { margin-right: 15px; text-decoration: none; color: #0066cc; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 1em; }
        .btn { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; font-size: 1em; }
        .btn:hover { background: #0052a3; }
        .btn-destructive { background: #dc3545; }
        .btn-destructive:hover { background: #c82333; }
        .cart-count { background: #0066cc; color: white; border-radius: 50%; padding: 2px 8px; font-size: 0.8em; }
        .flash { padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .flash.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .flash.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .order-summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
      </style>
    </head>
    <body>
      <header class="header">
        <h1><a href="/" style="text-decoration: none; color: inherit;">Aperture</a></h1>
        <nav class="nav">
          <a href="/">Home</a>
          <a href="/products">Products</a>
          <a href="/cart">Cart (<span class="cart-count">${cart.reduce((sum, item) => sum + item.qty, 0)}</span>)</a>
          ${req.session.user ? `<a href="/account">Account</a> <form action="/logout" method="POST" style="display:inline;"><button class="btn" type="submit">Logout</button></form>` : `<a href="/login">Login</a>`}
        </nav>
      </header>
      ${req.session.flash ? `<div class="flash ${req.session.flash.type}">${req.session.flash.message}</div>` : ''}
      <main>
        <h2>Checkout</h2>
        <div class="order-summary">
          <h3>Order Summary</h3>
          ${cart.map(item => `<div>${item.name} × ${item.qty} - $${(item.price * item.qty).toFixed(2)}</div>`).join('')}
          <div style="font-weight: bold; font-size: 1.2em; margin-top: 10px;">Total: $${total.toFixed(2)}</div>
        </div>
        <form action="/checkout/place" method="POST">
          <div class="form-group">
            <label for="fullName">Full Name</label>
            <input type="text" id="fullName" name="fullName" required autocomplete="name">
          </div>
          <div class="form-group">
            <label for="address">Address</label>
            <input type="text" id="address" name="address" required autocomplete="street-address">
          </div>
          <div class="form-group">
            <label for="city">City</label>
            <input type="text" id="city" name="city" required autocomplete="address-level2">
          </div>
          <div class="form-group">
            <label for="zip">ZIP Code</label>
            <input type="text" id="zip" name="zip" required autocomplete="postal-code">
          </div>
          <div class="form-group">
            <label for="country">Country</label>
            <select id="country" name="country" required autocomplete="country">
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="UK">United Kingdom</option>
            </select>
          </div>
          <div class="form-group">
            <label for="cardNumber">Card Number</label>
            <input type="text" id="cardNumber" name="cardNumber" required autocomplete="cc-number" placeholder="4242 4242 4242 4242">
          </div>
          <div class="form-group">
            <label for="expiry">Expiry</label>
            <input type="text" id="expiry" name="expiry" required autocomplete="cc-exp" placeholder="MM/YY">
          </div>
          <div class="form-group">
            <label for="cvv">CVV</label>
            <input type="text" id="cvv" name="cvv" required autocomplete="cc-csc" placeholder="123">
          </div>
          <button class="btn" type="submit">Place Order ($${total.toFixed(2)})</button>
          <a href="/cart" class="btn" style="background: #6c757d; margin-left: 10px;">Back to Cart</a>
        </form>
      </main>
    </body>
    </html>
  `);
  delete req.session.flash;
});

app.post("/checkout/place", requireAuth, (req, res) => {
  const cart = getCart(req);
  if (cart.length === 0) {
    req.session.flash = { type: "error", message: "Cart is empty" };
    return res.redirect("/cart");
  }

  if (mutationMode === "incorrect_total") {
    req.session.flash = { type: "error", message: "Payment failed: amount mismatch" };
    return res.redirect("/checkout");
  }

  const orderId = `ORD-${Date.now()}`;
  req.session.cart = [];
  req.session.flash = { type: "success", message: `Order ${orderId} placed successfully!` };
  res.redirect(`/orders/${orderId}`);
});

app.get("/orders/:id", requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Aperture - Order ${req.params.id}</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .nav a { margin-right: 15px; text-decoration: none; color: #0066cc; }
        .btn { display: inline-block; padding: 8px 16px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; }
        .cart-count { background: #0066cc; color: white; border-radius: 50%; padding: 2px 8px; font-size: 0.8em; }
        .flash { padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .flash.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
      </style>
    </head>
    <body>
      <header class="header">
        <h1><a href="/" style="text-decoration: none; color: inherit;">Aperture</a></h1>
        <nav class="nav">
          <a href="/">Home</a>
          <a href="/products">Products</a>
          <a href="/cart">Cart (<span class="cart-count">0</span>)</a>
          ${req.session.user ? `<a href="/account">Account</a> <form action="/logout" method="POST" style="display:inline;"><button class="btn" type="submit">Logout</button></form>` : `<a href="/login">Login</a>`}
        </nav>
      </header>
      ${req.session.flash ? `<div class="flash ${req.session.flash.type}">${req.session.flash.message}</div>` : ''}
      <main>
        <h2>Order Confirmed</h2>
        <p>Your order <strong>${req.params.id}</strong> has been placed successfully.</p>
        <a href="/products" class="btn">Continue Shopping</a>
      </main>
    </body>
    </html>
  `);
  delete req.session.flash;
});

app.get("/login", (req, res) => {
  const redirect = req.query.redirect || "/";
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Aperture - Sign In</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 1em; }
        .btn { display: block; width: 100%; padding: 12px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; font-size: 1em; }
        .btn:hover { background: #0052a3; }
        .flash { padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .flash.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Aperture</h1>
        <p>Sign in to your account</p>
      </div>
      ${req.session.flash ? `<div class="flash ${req.session.flash.type}">${req.session.flash.message}</div>` : ''}
      <form action="/login" method="POST">
        <input type="hidden" name="redirect" value="${redirect}">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required autocomplete="email">
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required autocomplete="current-password">
        </div>
        <button class="btn" type="submit">Sign In</button>
      </form>
      <p style="text-align: center; margin-top: 20px; color: #666;">Test account: user@example.com / password123</p>
    </body>
    </html>
  `);
  delete req.session.flash;
});

app.post("/login", (req, res) => {
  const { email, password, redirect } = req.body;
  const user = users.get(email);
  if (user && user.password === password) {
    req.session.user = { email, name: user.name };
    res.redirect(redirect || "/");
  } else {
    req.session.flash = { type: "error", message: "Invalid email or password" };
    res.redirect("/login?redirect=" + encodeURIComponent(redirect || "/"));
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/account", requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Aperture - Account</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .nav a { margin-right: 15px; text-decoration: none; color: #0066cc; }
        .cart-count { background: #0066cc; color: white; border-radius: 50%; padding: 2px 8px; font-size: 0.8em; }
        .flash { padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .flash.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
      </style>
    </head>
    <body>
      <header class="header">
        <h1><a href="/" style="text-decoration: none; color: inherit;">Aperture</a></h1>
        <nav class="nav">
          <a href="/">Home</a>
          <a href="/products">Products</a>
          <a href="/cart">Cart (<span class="cart-count">0</span>)</a>
          ${req.session.user ? `<a href="/account">Account</a> <form action="/logout" method="POST" style="display:inline;"><button class="btn" type="submit">Logout</button></form>` : `<a href="/login">Login</a>`}
        </nav>
      </header>
      ${req.session.flash ? `<div class="flash ${req.session.flash.type}">${req.session.flash.message}</div>` : ''}
      <main>
        <h2>My Account</h2>
        <p>Welcome, ${req.session.user.name} (${req.session.user.email})</p>
        <p><a href="/orders">Order History</a></p>
      </main>
    </body>
    </html>
  `);
  delete req.session.flash;
});

app.post("/mutation", express.json(), (req, res) => {
  const { mode } = req.body;
  if (["none", "renamed_button", "incorrect_total"].includes(mode)) {
    mutationMode = mode;
    res.json({ success: true, mode: mutationMode });
  } else {
    res.status(400).json({ success: false, error: "Invalid mutation mode" });
  }
});

app.get("/mutation", (req, res) => {
  res.json({ mode: mutationMode });
});

app.listen(PORT, () => {
  console.log(`Aperture shop running on http://localhost:${PORT}`);
});

export { app, users, products, getCart, mutationMode };