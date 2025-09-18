// ユーザー情報を取得して表示する関数
var user_list_container = document.getElementById('user_list');

function get_user_data() {
  // APIからユーザーデータを取得する想定
  setTimeout(function() {
    var users = [
      { id: 1, name: '佐藤', status: 1 },
      { id: 2, name: '鈴木', status: 2 },
      { id: 3, name: '高橋', status: 1 },
      { id: 4, name: '田中', status: 1 },
    ];

    var user_names = '';
    for (var i = 0; i < users.length; i++) {
      // statusが1ならアクティブユーザー
      if (users[i].status === 1) {
        user_names += '<li>' + users[i].name + '</li>';
      }
    }
    user_list_container.innerHTML = '<ul>' + user_names + '</ul>';
  }, 1000);
}

get_user_data();
