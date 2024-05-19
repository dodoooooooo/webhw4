var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db/sqlite.db', (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('已連接至 SQLite 資料庫。');
});

// 修正表結構
db.run(`CREATE TABLE IF NOT EXISTS combined_data (
    date VARCHAR(7) PRIMARY KEY,
    pork REAL,
    nubian REAL,
    ram REAL
)`);

// 轉換西元年月為民國年月的函式
function toROCDate(date) {
    const [year, month] = date.split('-');
    const rocYear = parseInt(year) - 1911;
    return `${rocYear}-${month}`;
}

app.get('/api/quotes', (req, res) => {
    let { start, end, products } = req.query;

    // 如果未指定日期範圍，則設定預設範圍為資料庫中的最小和最大日期
    if (!start || !end) {
        start = '109-01';
        end = '113-01';
        fetchData(start, end, products, (err, data) => { // 直接傳入 null 表示忽略日期條件
            if (err) {
                res.status(500).send('內部伺服器錯誤');
                return;
            }
            res.json(data); // 發送回應
        });
    } else {
        start = toROCDate(start);
        end = toROCDate(end);
        // 結束月份加一
        const [year, month] = end.split('-');
        const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
        const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
        end = `${nextYear}-${nextMonth.toString().padStart(2, '0')}`;
        fetchData(start, end, products, (err, data) => { // 使用回呼函式處理資料
            if (err) {
                res.status(500).send('內部伺服器錯誤');
                return;
            }
            res.json(data); // 發送回應
        });
    }
});

// 定義函式以獲取資料
function fetchData(start, end, products, callback) {
    let productColumns = ['date'];
    if (products) {
        const productList = products.split(',');
        if (productList.includes('pork')) productColumns.push('pork');
        if (productList.includes('nubian')) productColumns.push('nubian');
        if (productList.includes('ram')) productColumns.push('ram');
    }
    const columns = productColumns.join(', ');

    // 修改查詢語句，使用 DATE_SUB 函數將日期字串轉換為日期物件，並以這些日期物件進行比較
    let sql = `SELECT ${columns} FROM combined_data WHERE REPLACE(date, '年', '-') BETWEEN ? AND ?`;

    db.all(sql, [start, end], (err, rows) => {
        if (err) {
            console.error(err.message);
            callback(err, null);
            return;
        }
        callback(null, rows);
    });
}

// 撰寫 get /api 路由，使用 SQLite 查詢某 date 的所有資料
app.get('/api', (req, res) => {
    let date = req.query.date;
    let sql = 'SELECT * FROM combined_data WHERE date = ?';
    db.all(sql, [date], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('內部伺服器錯誤');
            return;
        }
        res.send(rows);
    });
});

// 撰寫 post /api 路由，使用 SQLite 新增一筆資料
app.post('/api', (req, res) => {
    let { date, pork, nubian, ram } = req.body;
    let sql = 'INSERT INTO combined_data (date, pork, nubian, ram) VALUES (?, ?, ?, ?)';
    db.run(sql, [date, pork, nubian, ram], function(err) {
        if (err) {
            console.error(err.message);
            res.status(500).send('內部伺服器錯誤');
            return;
        }
        res.send({ id: this.lastID });
    });
});

module.exports = app;