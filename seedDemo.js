import { sequelize, connectDB } from "./src/lib/db.js";
import { SubAdmin } from "./src/models/SubAdmin.js";
import { Category } from "./src/models/Category.js";
import { MenuItem } from "./src/models/MenuItem.js";
import { Table } from "./src/models/Table.js";
import { Order } from "./src/models/Order.js";

async function seed() {
  try {
    await connectDB();
    
    // Check if demo user exists
    let demoSubAdmin = await SubAdmin.findOne({ where: { email: 'demo@dreamapp.com' } });
    
    if (demoSubAdmin) {
      console.log("Demo account already exists. Clearing old data...");
      await Category.destroy({ where: { subAdminId: demoSubAdmin.id } });
      await MenuItem.destroy({ where: { subAdminId: demoSubAdmin.id } });
      await Table.destroy({ where: { subAdminId: demoSubAdmin.id } });
      await Order.destroy({ where: { subAdminId: demoSubAdmin.id } });
    } else {
      console.log("Creating demo account...");
      demoSubAdmin = await SubAdmin.create({
        name: "Demo Restaurant",
        email: "demo@dreamapp.com",
        password: "demo_password_123",
        phone: "1234567890",
        status: "active",
        themeColor: "#ff5722",
        publicMenuTheme: "modern"
      });
    }

    const subAdminId = demoSubAdmin.id || demoSubAdmin._id;

    console.log("Seeding categories...");
    const catBurgers = await Category.create({ name: "Burgers", subAdminId, description: "Juicy burgers", image: "" });
    const catPizzas = await Category.create({ name: "Pizzas", subAdminId, description: "Wood-fired pizzas", image: "" });
    const catDrinks = await Category.create({ name: "Drinks", subAdminId, description: "Cold beverages", image: "" });

    console.log("Seeding menu items...");
    await MenuItem.create({ name: "Classic Cheeseburger", price: 250, description: "Beef patty with cheese", available: true, foodType: "non-veg", categoryId: catBurgers.id, subAdminId });
    await MenuItem.create({ name: "Veggie Burger", price: 180, description: "Plant-based patty", available: true, foodType: "veg", categoryId: catBurgers.id, subAdminId });
    await MenuItem.create({ name: "Margherita Pizza", price: 350, description: "Classic cheese and tomato", available: true, foodType: "veg", categoryId: catPizzas.id, subAdminId });
    await MenuItem.create({ name: "Pepperoni Pizza", price: 450, description: "Double pepperoni", available: true, foodType: "non-veg", categoryId: catPizzas.id, subAdminId });
    await MenuItem.create({ name: "Coke", price: 60, description: "Chilled Can", available: true, foodType: "veg", categoryId: catDrinks.id, subAdminId });
    await MenuItem.create({ name: "Cold Coffee", price: 120, description: "Sweet & refreshing", available: true, foodType: "veg", categoryId: catDrinks.id, subAdminId });

    console.log("Seeding tables...");
    const table1 = await Table.create({ name: "Table 1", code: "T1", capacity: 4, status: "available", subAdminId });
    const table2 = await Table.create({ name: "Table 2", code: "T2", capacity: 2, status: "occupied", subAdminId });
    const table3 = await Table.create({ name: "Table 3", code: "T3", capacity: 6, status: "waiting_for_food", subAdminId });
    await Table.create({ name: "Table 4", code: "T4", capacity: 4, status: "available", subAdminId });
    await Table.create({ name: "Table 5", code: "T5", capacity: 8, status: "available", subAdminId });

    console.log("Seeding orders...");
    await Order.create({
      orderNumber: "ORD-1001",
      customerName: "John Doe",
      status: "preparing",
      tableId: table3.id,
      items: [{ name: "Margherita Pizza", quantity: 1, price: 350 }, { name: "Coke", quantity: 2, price: 60 }],
      totalAmount: 470,
      subAdminId,
      orderType: "dine-in"
    });

    await Order.create({
      orderNumber: "ORD-1002",
      customerName: "Jane Smith",
      status: "served",
      tableId: table2.id,
      items: [{ name: "Classic Cheeseburger", quantity: 2, price: 250 }],
      totalAmount: 500,
      subAdminId,
      orderType: "dine-in"
    });

    await Order.create({
      orderNumber: "ORD-1003",
      customerName: "Alice Delivery",
      status: "pending",
      items: [{ name: "Veggie Burger", quantity: 1, price: 180 }],
      totalAmount: 180,
      subAdminId,
      orderType: "delivery",
      deliveryAddress: "123 Main St"
    });

    console.log("Demo seed complete!");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding demo:", error);
    process.exit(1);
  }
}

seed();
