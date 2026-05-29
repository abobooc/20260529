import { useState, useEffect, useCallback } from 'react'
import './App.css'

// 已整合的 Google Apps Script 網頁應用程式網址
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyTg696T5CYsX-MIXIF2uVZob-I2gdISIkxK2g16Rn4IShgxPiLxd7i9D_kOFeyuvsA/exec';

function App() {
  const [events, setEvents] = useState([]);
  const [formData, setFormData] = useState({
    summary: '',
    categories: '教學活動',
    startDate: '',
    endDate: '',
    description: ''
  });
  const [categoryList, setCategoryList] = useState(['教學活動', '行政會議', '重要截止', '學生活動', '假日', '學期課程', '招生相關']);
  const [newCategory, setNewCategory] = useState('');
  const [viewMode, setViewMode] = useState('calendar'); // 'list' or 'calendar'
  const [filterCategory, setFilterCategory] = useState('全部');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUid, setEditingUid] = useState(null);

  // 從 Google Sheets 獲取資料
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      // 加入時間戳記參數 (?_=...) 防止瀏覽器快取舊的空資料
      const response = await fetch(`${GAS_URL}?_=${Date.now()}`);
      if (!response.ok) throw new Error('網路回應不正確');
      
      const data = await response.json();

      // 標準化資料格式，確保所有日期欄位都是字串且存在，避免排序時出錯
      const normalizedData = data
        .map(ev => ({
          ...ev,
          startdate: String(ev.startdate || ''),
          enddate: String(ev.enddate || ''),
          categories: ev.categories || '未分類'
        }))
        .sort((a, b) => b.startdate.localeCompare(a.startdate));

      setEvents(normalizedData);

      // 自動從現有資料中提取所有類別並同步到清單
      const existingCats = [...new Set(normalizedData.map(ev => ev.categories))];
      setCategoryList(prev => [...new Set([...prev, ...existingCats])]);
    } catch (error) {
      console.error('Fetch error:', error);
      alert('無法取得 Google Sheets 資料，請檢查 Apps Script 部署設定。');
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredEvents = filterCategory === '全部' ? events : events.filter(ev => ev.categories === filterCategory);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 共通儲存函式 (支援單筆或批次處理以提升效能)
  const saveEventsToGas = async (data) => {
    const isArray = Array.isArray(data);
    const eventsToProcess = isArray ? data : [data];
    
    const payloads = eventsToProcess.map(eventData => {
      const uid = eventData.uid || `cal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@calendar`;
      const cat = eventData.categories || '未分類';
      return {
        ...eventData,
        uid,
        startDate: String(eventData.startDate || eventData.startdate).replace(/-/g, ''),
        endDate: String(eventData.endDate || eventData.enddate).replace(/-/g, ''),
        categories: cat
      };
    });

    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(isArray ? payloads : payloads[0])
    });

    // 同步更新類別列表
    const newCats = payloads.map(p => p.categories);
    setCategoryList(prev => [...new Set([...prev, ...newCats])]);

    return isArray ? payloads : payloads[0];
  };

  // 刪除事項
  const handleDelete = async (uid) => {
    if (!window.confirm('確定要刪除此事項嗎？')) return;
    
    setLoading(true);
    try {
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ action: 'delete', uid })
      });
      
      // 同步更新本地狀態
      setEvents(prev => prev.filter(ev => ev.uid !== uid));
      
      // 如果正在編輯該事項，則重設表單
      if (isEditing && editingUid === uid) {
        setIsEditing(false);
        setEditingUid(null);
        setFormData({ summary: '', categories: '教學活動', startDate: '', endDate: '', description: '' });
      }
      alert('已刪除事項');
    } catch (error) {
      console.error('Delete error:', error);
      alert('刪除失敗');
    } finally {
      setLoading(false);
    }
  };

  // 進入編輯模式
  const handleEdit = (ev) => {
    setFormData({
      summary: ev.summary,
      categories: ev.categories,
      startDate: ev.startdate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      endDate: ev.enddate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      description: ev.description || ''
    });
    setEditingUid(ev.uid);
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 手動新增
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const eventToSubmit = { ...formData, uid: isEditing ? editingUid : null };
      const savedEvent = await saveEventsToGas(eventToSubmit);
      // 立即更新本地狀態，讓使用者看到結果
      const newLocalEvent = {
        ...savedEvent,
        startdate: savedEvent.startDate, // 轉成清單/日曆使用的 Key
        enddate: savedEvent.endDate
      };
      
      if (isEditing) {
        setEvents(prev => prev.map(ev => ev.uid === editingUid ? newLocalEvent : ev).sort((a, b) => b.startdate.localeCompare(a.startdate)));
        setIsEditing(false);
        setEditingUid(null);
        alert('已更新事項');
      } else {
        setEvents(prev => [newLocalEvent, ...prev].sort((a, b) => b.startdate.localeCompare(a.startdate)));
        alert('已儲存至 Google Sheets');
      }

      setFormData(prev => ({ ...prev, summary: '', startDate: '', endDate: '', description: '' }));
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setLoading(false);
    }
  };

  // 手動新增類別
  const handleAddCategory = () => {
    if (newCategory && !categoryList.includes(newCategory)) {
      setCategoryList([...categoryList, newCategory]);
      setNewCategory('');
    }
  };

  // 匯入 ICS 功能
  const handleImportIcs = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const vevents = text.split('BEGIN:VEVENT').slice(1);
      const eventsToImport = [];

      for (const vevent of vevents) {
        const summaryMatch = vevent.match(/SUMMARY:(.*)/m);
        const startMatch = vevent.match(/DTSTART;VALUE=DATE:(\d{8})/m);
        const endMatch = vevent.match(/DTEND;VALUE=DATE:(\d{8})/m);
        const categoriesMatch = vevent.match(/CATEGORIES:(.*)/m);
        const descriptionMatch = vevent.match(/DESCRIPTION:(.*)/m);

        if (summaryMatch && startMatch && endMatch) {
          eventsToImport.push({
            summary: summaryMatch[1].trim(),
            startdate: startMatch[1].trim(),
            enddate: endMatch[1].trim(),
            categories: categoriesMatch ? categoriesMatch[1].trim() : '匯入事項',
            description: descriptionMatch ? descriptionMatch[1].trim() : ''
          });
        }
      }

      if (eventsToImport.length > 0) {
        const savedPayloads = await saveEventsToGas(eventsToImport);
        const newLocalEvents = savedPayloads.map(p => ({ ...p, startdate: p.startDate, enddate: p.endDate }));
        setEvents(prev => [...newLocalEvents, ...prev].sort((a, b) => b.startdate.localeCompare(a.startdate)));
        alert(`匯入完成！成功匯入 ${eventsToImport.length} 筆事項。`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('匯入失敗，請確認檔案格式。');
    } finally {
      setLoading(false);
      e.target.value = null; // 清空 input
    }
  };

  // 匯出 ICS 檔案
  const exportToIcs = () => {
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//校園行事曆//ZH',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:校園行事曆',
      'X-WR-TIMEZONE:Asia/Taipei'
    ];

    events.forEach(event => {
      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`DTSTART;VALUE=DATE:${event.startdate}`);
      icsContent.push(`DTEND;VALUE=DATE:${event.enddate}`);
      icsContent.push(`DTSTAMP:${now}`);
      icsContent.push(`UID:${event.uid}`);
      icsContent.push(`SUMMARY:${event.summary}`);
      icsContent.push(`CATEGORIES:${event.categories}`);
      if (event.description) icsContent.push(`DESCRIPTION:${event.description}`);
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `calendar-events-${new Date().toISOString().slice(0, 10)}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 日曆邏輯輔助函式
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { days, firstDay, year, month };
  };

  const changeMonth = (offset) => {
    const newDate = new Date(currentMonth.setMonth(currentMonth.getMonth() + offset));
    setCurrentMonth(new Date(newDate));
  };

  const renderCalendar = () => {
    const { days, firstDay, year, month } = getDaysInMonth(currentMonth);
    const cells = [];
    
    // 空白格子 (前一個月)
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    // 當月日期
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}${String(month + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;
      const dayEvents = filteredEvents.filter(ev => dateStr >= ev.startdate && dateStr <= ev.enddate);
      
      cells.push(
        <div key={d} className="calendar-day">
          <span className="day-number">{d}</span>
          <div className="day-events">
            {dayEvents.map((ev, i) => (
              <div key={i} className={`event-dot ${ev.categories}`} title={ev.summary} onClick={() => handleEdit(ev)}>
                {ev.summary}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="calendar-grid">
        {['日', '一', '二', '三', '四', '五', '六'].map(d => (
          <div key={d} className="weekday-header">{d}</div>
        ))}
        {cells}
      </div>
    );
  };

  return (
    <div className="app-container">
      <header>
        <h1>校園行事曆管理系統</h1>
        <p className="subtitle">同步 Google Sheets 雲端資料庫 | 當前篩選：{filterCategory}</p>
      </header>

      <main className="main-content">
        <aside className="sidebar" style={{ minWidth: 0 }}>
          <section className="form-card">
            <h2>新增事項</h2>
            <form onSubmit={handleSubmit} className="event-form">
              <div className="form-group">
                <label>事項摘要</label>
                <input name="summary" placeholder="例如：期中考週" value={formData.summary} onChange={handleInputChange} required />
              </div>
              <div className="form-group">
                <label>類別</label>
                <select name="categories" value={formData.categories} onChange={handleInputChange}>
                  {categoryList.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="date-row">
                <div className="form-group">
                  <label>開始</label>
                  <input type="date" name="startDate" value={formData.startDate} onChange={handleInputChange} required />
                </div>
                <div className="form-group">
                  <label>結束</label>
                  <input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} required />
                </div>
              </div>
              <div className="form-group">
                <label>描述</label>
                <textarea name="description" placeholder="詳細內容..." value={formData.description} onChange={handleInputChange} />
              </div>
              <div className="form-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="submit-btn" disabled={loading} style={{ flex: 2 }}>
                  {isEditing ? '更新事項' : '儲存至雲端'}
                </button>
                {isEditing && (
                  <button type="button" className="cancel-btn" onClick={() => {
                    setIsEditing(false);
                    setEditingUid(null);
                    setFormData(prev => ({ ...prev, summary: '', startDate: '', endDate: '', description: '' }));
                  }}>取消</button>
                )}
                {isEditing && (
                  <button type="button" className="delete-btn-form" onClick={() => handleDelete(editingUid)} disabled={loading}>刪除</button>
                )}
              </div>
            </form>
          </section>

          <section className="form-card">
            <h2>類別管理</h2>
            <div className="category-manager">
              <div className="add-cat-input">
                <input 
                  value={newCategory} 
                  onChange={(e) => setNewCategory(e.target.value)} 
                  placeholder="輸入新類別"
                />
                <button onClick={handleAddCategory}>新增</button>
              </div>
              <div className="cat-tags">
                <span 
                  className={`badge ${filterCategory === '全部' ? 'active-filter' : ''}`}
                  onClick={() => setFilterCategory('全部')}
                  style={{ cursor: 'pointer', background: filterCategory === '全部' ? 'var(--accent)' : '#999' }}
                >全部</span>
                {categoryList.map(cat => (
                  <span 
                    key={cat} 
                    className={`badge ${cat} ${filterCategory === cat ? 'active-filter' : ''}`}
                    onClick={() => setFilterCategory(cat)}
                    style={{ cursor: 'pointer', border: filterCategory === cat ? '2px solid white' : 'none' }}
                  >{cat}</span>
                ))}
              </div>
            </div>
          </section>

          <section className="form-card import-card">
            <h2>批次匯入</h2>
            <p>匯入現有的 .ics 檔案同步至 Sheets</p>
            <input type="file" accept=".ics" onChange={handleImportIcs} disabled={loading} id="ics-upload" hidden />
            <label htmlFor="ics-upload" className="import-label">選擇 ICS 檔案匯入</label>
          </section>
        </aside>

        <section className="list-section">
          <div className="list-header">
            <div className="title-area">
              <h2>{viewMode === 'calendar' ? `${currentMonth.getFullYear()}年 ${currentMonth.getMonth() + 1}月` : `顯示事項 (${filteredEvents.length})`}</h2>
              {viewMode === 'calendar' && (
                <div className="nav-btns">
                  <button onClick={() => changeMonth(-1)}>上個月</button>
                  <button onClick={() => setCurrentMonth(new Date())}>今天</button>
                  <button onClick={() => changeMonth(1)}>下個月</button>
                </div>
              )}
            </div>
            <div className="action-btns">
              <div className="toggle-group">
                <button className={viewMode === 'calendar' ? 'active' : ''} onClick={() => setViewMode('calendar')}>日曆模式</button>
                <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>清單模式</button>
              </div>
              <button onClick={exportToIcs} className="export-btn" disabled={events.length === 0}>匯出 .ics</button>
            </div>
          </div>

          {loading ? <div className="loader">資料同步中...</div> : (
            viewMode === 'calendar' ? renderCalendar() : (
            <div className="table-container">
              <table className="event-table">
                <thead>
                  <tr>
                    <th>類別</th>
                    <th>日期範圍</th>
                    <th>摘要</th>
                    <th>描述</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((ev, idx) => (
                    <tr key={ev.uid || idx}>
                      <td><span className={`badge ${ev.categories}`}>{ev.categories}</span></td>
                      <td className="date-cell">{ev.startdate} - {ev.enddate}</td>
                      <td className="summary-cell">{ev.summary}</td>
                      <td className="desc-cell">{ev.description}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="edit-btn" onClick={() => handleEdit(ev)}>編輯</button>
                          <button className="delete-btn" onClick={() => handleDelete(ev.uid)}>刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )
          )}
        </section>
      </main>
    </div>
  )
}

export default App
