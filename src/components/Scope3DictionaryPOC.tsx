'use client';
import React, { useState, useEffect } from 'react';
import { Upload, Download, Brain, Database, Plus, Trash2, Edit3, CheckCircle, AlertTriangle, BarChart3, FileText, Zap } from 'lucide-react';

// データ構造
interface DictionaryEntry {
  id: string;
  keywords: string[];
  category: string;
  categoryCode: string;
  confidence: number;
  source: 'manual' | 'learned';
  frequency: number;
  minAmount?: number;
  maxAmount?: number;
  supplierHints?: string[];
}

interface MatchResult {
  itemName: string;
  supplierName: string;
  amount: number;
  matchedEntry: DictionaryEntry | null;
  confidence: number;
  predictedCategory: string;
}

const Scope3DictionaryPOC = () => {
  const [activeTab, setActiveTab] = useState<'learn' | 'dictionary' | 'test'>('learn');
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>([]);
  const [learningFile, setLearningFile] = useState<File | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [learningProgress, setLearningProgress] = useState(0);
  const [testResults, setTestResults] = useState<MatchResult[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [learningDataCount, setLearningDataCount] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [newEntry, setNewEntry] = useState<Partial<DictionaryEntry>>({
    keywords: [],
    category: '',
    categoryCode: '',
    source: 'manual'
  });

// 初期辞書データ
useEffect(() => {
  console.log('useEffect実行: 辞書を空に初期化');
  setDictionary([]);
  console.log('初期化完了');
}, []);

  // デモ学習機能
// 実際の学習データから辞書生成（修正版）
const learnFromData = async () => {
  if (!learningFile) {
    alert('学習ファイルを選択してください');
    return;
  }

  setIsLearning(true);
  setLearningProgress(0);
  setCurrentStep('ファイル読み込み中...');

  try {
    // ファイル読み込み
    const fileData = await learningFile.arrayBuffer();
    
    setLearningProgress(10);
    setCurrentStep('Excelファイル解析中...');

    // SheetJSを使用してExcel解析
    if (typeof window !== 'undefined' && (window as any).XLSX) {
      const XLSX = (window as any).XLSX;
      const workbook = XLSX.read(fileData);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      setLearningProgress(25);
      setCurrentStep(`データ解析中... (${rawData.length}行)`);

      // ヘッダーを除外してデータを取得（品目名、仕入先名、金額、排出原単位）
      const learningData = rawData.slice(1).filter((row: any) => 
        row && row.length >= 4 && row[3] && row[3].toString().includes('環境省DB')
      );
      
      setLearningDataCount(learningData.length);
      console.log(`有効な学習データ: ${learningData.length}件`);

      if (learningData.length === 0) {
        throw new Error('環境省DB排出原単位が設定されたデータが見つかりません。');
      }

      setLearningProgress(50);
      setCurrentStep('カテゴリ別グループ化中...');

      // カテゴリ別にデータをグループ化
      const categoryGroups: { [key: string]: any[] } = {};
      
      learningData.forEach((row: any, index: number) => {
        try {
          const itemName = row[0]?.toString() || '';
          const supplier = row[1]?.toString() || '';
          const amount = row[2] ? parseFloat(row[2].toString()) : 0;
          const emissionUnit = row[3]?.toString() || '';
          
          if (itemName && supplier && emissionUnit) {
            if (!categoryGroups[emissionUnit]) {
              categoryGroups[emissionUnit] = [];
            }
            categoryGroups[emissionUnit].push({ 
              itemName, 
              supplier, 
              amount, 
              index: index + 2 
            });
          }
        } catch (error) {
          console.warn(`行${index + 2}でエラー:`, error);
        }
      });

      const categoryCount = Object.keys(categoryGroups).length;
      console.log(`カテゴリ数: ${categoryCount}`);

      setLearningProgress(75);
      setCurrentStep(`辞書生成中... (${categoryCount}カテゴリ)`);

      // 各カテゴリからキーワードパターンを抽出
      const newEntries: DictionaryEntry[] = [];
      let entryId = Date.now();

      for (const [emissionUnit, items] of Object.entries(categoryGroups)) {
        if (items.length < 2) continue; // 最低2件以上で学習

        try {
          // 1. キーワード抽出
          const allKeywords: string[] = [];
          const suppliers: string[] = [];
          const amounts: number[] = [];

          items.forEach(item => {
            // 品目名からキーワード抽出
            const itemKeywords = extractKeywordsFromText(item.itemName);
            allKeywords.push(...itemKeywords);
            
            // 仕入先名を正規化
            const normalizedSupplier = normalizeSupplierName(item.supplier);
            if (normalizedSupplier) suppliers.push(normalizedSupplier);
            
            // 金額収集
            if (item.amount > 0) amounts.push(item.amount);
          });

          // 2. 頻出キーワードを抽出
          const keywordFreq: { [key: string]: number } = {};
          allKeywords.forEach(keyword => {
            if (keyword && keyword.length >= 2) {
              keywordFreq[keyword] = (keywordFreq[keyword] || 0) + 1;
            }
          });

          // 3. 重要キーワードを選択（頻度ベース）
          const minFreq = Math.max(1, Math.floor(items.length * 0.1)); // 最低10%の頻度
          const significantKeywords = Object.entries(keywordFreq)
            .filter(([_, freq]) => freq >= minFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6) // 最大6個
            .map(([keyword]) => keyword);

          if (significantKeywords.length > 0) {
            // 4. カテゴリ名とコード抽出
            const categoryMatch = emissionUnit.match(/(\d{6})\s+(.+?)(?:\s*$)/);
            const categoryCode = categoryMatch ? categoryMatch[1] : '';
            const categoryName = categoryMatch ? 
              categoryMatch[2].trim() : 
              emissionUnit.replace('環境省DB 5産連表', '').trim();

            // 5. 金額レンジ計算
            amounts.sort((a, b) => a - b);
            const minAmount = amounts.length > 0 ? amounts[0] : undefined;
            const maxAmount = amounts.length > 0 ? amounts[amounts.length - 1] : undefined;

            // 6. 信頼度計算（データ件数ベース）
            const confidence = Math.min(0.95, 
              Math.max(0.7, 0.7 + (Math.log10(items.length + 1) / 10))
            );

            newEntries.push({
              id: (entryId++).toString(),
              keywords: significantKeywords,
              category: categoryName,
              categoryCode,
              confidence,
              source: 'learned',
              frequency: items.length,
              minAmount,
              maxAmount,
              supplierHints: Array.from(new Set(suppliers)).slice(0, 4)
            });
          }
        } catch (error) {
          console.warn(`カテゴリ ${emissionUnit} の処理でエラー:`, error);
        }
      }

      setLearningProgress(90);
      setCurrentStep('辞書統合中...');

      // 既存辞書と統合
      setDictionary(prev => [...prev, ...newEntries]);
      
      setLearningProgress(100);
      setCurrentStep(`✅ 学習完了: ${newEntries.length}個の辞書エントリを生成しました`);
      
      console.log(`学習完了: ${newEntries.length}個のエントリを生成`);
      console.log('生成されたエントリ例:', newEntries.slice(0, 3));
      
    } else {
      throw new Error('Excelライブラリが読み込まれていません。ページを再読み込みしてください。');
    }
    
  } catch (error: any) {
    console.error('Learning error:', error);
    setCurrentStep(`❌ エラー: ${error.message}`);
    alert(`学習エラー: ${error.message}`);
  } finally {
    setIsLearning(false);
  }
};

// キーワード抽出関数（高精度版）
const extractKeywordsFromText = (text: string): string[] => {
  if (!text) return [];
  
  // 1. 正規化
  const normalized = text
    .toString()
    .replace(/\s+/g, '') // スペース除去
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)); // 全角→半角
  
  const keywords: string[] = [];
  
  // 2. 日本語キーワード抽出
  const japaneseWords = normalized.match(/[ァ-ヶー]{2,}|[あ-ん]{2,}|[一-龯]{1,}/g) || [];
  keywords.push(...japaneseWords.filter(word => 
    word.length >= 2 && 
    word.length <= 8 &&
    !['月分', '年分', '利用', '料金', '費用'].includes(word) // 汎用的すぎる単語は除外
  ));
  
  // 3. 英数字キーワード抽出
  const alphanumericWords = normalized.match(/[a-zA-Z0-9]{2,}/g) || [];
  keywords.push(...alphanumericWords.filter(word => 
    word.length >= 2 && 
    word.length <= 12 && 
    !/^\d+$/.test(word) && // 数字のみは除外
    !['LTD', 'INC', 'CO'].includes(word.toUpperCase()) // 法人格は除外
  ));
  
  return Array.from(new Set(keywords)).slice(0, 8); // 重複除去、最大8個
};

// 仕入先名正規化関数（改良版）
const normalizeSupplierName = (supplier: string): string => {
  if (!supplier) return '';
  
  let normalized = supplier
    .toString()
    .replace(/\(.*?\)/g, '') // 括弧内削除
    .replace(/（.*?）/g, '') // 全角括弧内削除
    .replace(/(株式会社|㈱|有限会社|㈲|合同会社|LLC|Inc|Corp|Ltd|Co\.)/gi, '') // 法人格削除
    .replace(/[引落]/g, '') // 引落等削除
    .replace(/\s+/g, '') // スペース削除
    .trim();
  
  return normalized.length >= 2 ? normalized : '';
};

  // 手動辞書エントリ追加
  const addDictionaryEntry = () => {
    if (!newEntry.category || !newEntry.categoryCode || keywordInput.trim() === '') return;

    const keywords = keywordInput.split(/[,、]/).map(k => k.trim()).filter(k => k);
    
    const entry: DictionaryEntry = {
      id: Date.now().toString(),
      keywords,
      category: newEntry.category!,
      categoryCode: newEntry.categoryCode!,
      confidence: 0.90,
      source: 'manual',
      frequency: 1
    };

    setDictionary(prev => [...prev, entry]);
    setNewEntry({ keywords: [], category: '', categoryCode: '', source: 'manual' });
    setKeywordInput('');
  };

  // デモテスト機能
const runDemo = () => {
  const demoResults: MatchResult[] = [
    {
      itemName: 'AWS利用料 月額',
      supplierName: 'Amazon Web Services',
      amount: 180000,
      matchedEntry: null,  // dictionary[0] から null に変更
      confidence: 0.94,
      predictedCategory: 'インターネット附随サービス'
    },
    {
      itemName: 'システム開発委託',
      supplierName: '株式会社ITソリューション',
      amount: 850000,
      matchedEntry: null,  // dictionary[1] から null に変更
      confidence: 0.92,
      predictedCategory: '情報サービス'
    },
    {
      itemName: 'iPhone 15 購入',
      supplierName: 'Apple Store',
      amount: 159800,
      matchedEntry: null,  // dictionary[2] から null に変更
      confidence: 0.89,
      predictedCategory: '電子計算機・同附属装置'
    }
  ];
  setTestResults(demoResults);
};

  // 統計計算
  const stats = {
    totalEntries: dictionary.length,
    learnedEntries: dictionary.filter(d => d.source === 'learned').length,
    manualEntries: dictionary.filter(d => d.source === 'manual').length,
    avgConfidence: dictionary.length > 0 ? dictionary.reduce((sum, d) => sum + d.confidence, 0) / dictionary.length : 0,
    testMatched: testResults.filter(r => r.matchedEntry).length,
    testTotal: testResults.length
  };
// キーワード抽出関数（高精度版）
// 仕入先名正規化関数（改良版）
const normalizeSupplierName = (supplier: string): string => {
  if (!supplier) return '';
  
  let normalized = supplier
    .toString()
    .replace(/\(.*?\)/g, '') // 括弧内削除
    .replace(/（.*?）/g, '') // 全角括弧内削除
    .replace(/(株式会社|㈱|有限会社|㈲|合同会社|LLC|Inc|Corp|Ltd|Co\.)/gi, '') // 法人格削除
    .replace(/[引落]/g, '') // 引落等削除
    .replace(/\s+/g, '') // スペース削除
    .trim();
  
  return normalized.length >= 2 ? normalized : '';
};
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* ヘッダー */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Scope3 AI辞書学習システム
              </h1>
              <p className="text-gray-600 mt-1">調達データから自動辞書生成・品目分類システム</p>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Database className="w-4 h-4" />
              <span>{stats.totalEntries}件の辞書エントリ</span>
            </div>
          </div>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'learn', label: '学習', icon: Brain, desc: '過去データから辞書を自動生成' },
                { id: 'dictionary', label: '辞書管理', icon: Database, desc: '辞書の確認・編集・追加' },
                { id: 'test', label: 'テスト', icon: Zap, desc: '新規データでマッチング精度を確認' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{tab.desc}</div>
                </button>
              ))}
            </nav>
          </div>

          {/* 学習タブ */}
          {activeTab === 'learn' && (
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">学習データアップロード</h2>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <div className="cursor-pointer">
                        <span className="text-lg font-medium text-gray-900">2023下期実績データ</span>
                        <p className="text-gray-500 mt-2">
                          品目名・仕入先名・排出原単位が含まれたExcelファイル
                        </p>
                        <p className="text-sm text-blue-600 mt-2">※現在はデモモードです</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={learnFromData}
                    disabled={isLearning}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 transition-all"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <Brain className="w-5 h-5" />
                      <span>{isLearning ? '学習中...' : 'AI学習デモ開始'}</span>
                    </div>
                  </button>

                  {isLearning && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex justify-between text-sm text-blue-600 mb-2">
                        <span>{currentStep}</span>
                        <span>{learningProgress.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${learningProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">学習統計</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{stats.learnedEntries}</div>
                      <div className="text-sm text-blue-700">学習済み辞書</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{stats.manualEntries}</div>
                      <div className="text-sm text-green-700">手動登録辞書</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{dictionary.length}</div>
                      <div className="text-sm text-purple-700">総カテゴリ数</div>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{learningDataCount.toLocaleString()}</div>
                      <div className="text-sm text-orange-700">学習データ件数</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 辞書管理タブ */}
          {activeTab === 'dictionary' && (
            <div className="p-8">
              <div className="space-y-8">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">新規辞書エントリ追加</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">キーワード（カンマ区切り）</label>
                      <input
                        type="text"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        placeholder="例：システム開発,委託開発,IT開発"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">カテゴリ名</label>
                      <input
                        type="text"
                        value={newEntry.category || ''}
                        onChange={(e) => setNewEntry(prev => ({ ...prev, category: e.target.value }))}
                        placeholder="例：情報サービス"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">カテゴリコード</label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={newEntry.categoryCode || ''}
                          onChange={(e) => setNewEntry(prev => ({ ...prev, categoryCode: e.target.value }))}
                          placeholder="733101"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          onClick={addDictionaryEntry}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">辞書エントリ一覧</h2>
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">キーワード</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">分類カテゴリ</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">コード</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">信頼度</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ソース</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {dictionary.map((entry) => (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div className="flex flex-wrap gap-1">
                                {entry.keywords.slice(0, 3).map((keyword, idx) => (
                                  <span key={idx} className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                    {keyword}
                                  </span>
                                ))}
                                {entry.keywords.length > 3 && (
                                  <span className="text-xs text-gray-500">+{entry.keywords.length - 3}個</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                              <div className="font-medium">{entry.category}</div>
                              <div className="text-xs text-gray-500">環境省DB 5産連表 {entry.categoryCode}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {entry.categoryCode}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                entry.confidence >= 0.9 ? 'bg-green-100 text-green-800' :
                                entry.confidence >= 0.7 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {(entry.confidence * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                entry.source === 'learned' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {entry.source === 'learned' ? '学習' : '手動'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* テストタブ */}
          {activeTab === 'test' && (
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">テストデータアップロード</h2>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-400 transition-colors">
                      <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <div className="cursor-pointer">
                        <span className="text-lg font-medium text-gray-900">未分類の調達データ</span>
                        <p className="text-gray-500 mt-2">
                          品目名・仕入先名・金額が含まれたCSV/Excelファイル
                        </p>
                        <p className="text-sm text-green-600 mt-2">※現在はデモモードです</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={runDemo}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 px-6 rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 transition-all"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <Zap className="w-5 h-5" />
                      <span>マッチングデモ実行</span>
                    </div>
                  </button>
                </div>

                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">テスト結果</h2>
                  {testResults.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{stats.testMatched}</div>
                        <div className="text-sm text-green-700">マッチ成功</div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {stats.testTotal > 0 ? (stats.testMatched / stats.testTotal * 100).toFixed(1) : 0}%
                        </div>
                        <div className="text-sm text-blue-700">マッチング精度</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {testResults.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">マッチング結果詳細</h3>
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">品目名</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">仕入先</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">予測カテゴリ</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">信頼度</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {testResults.map((result, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                              {result.itemName}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                              {result.supplierName}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              ¥{result.amount.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {result.matchedEntry ? (
                                <div>
                                  <div className="font-medium">{result.predictedCategory}</div>
                                  <div className="text-xs text-gray-500">コード: {result.matchedEntry.categoryCode}</div>
                                </div>
                              ) : (
                                <span className="text-gray-400">未分類</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {result.matchedEntry && (
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  result.confidence >= 0.8 ? 'bg-green-100 text-green-800' :
                                  result.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {(result.confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {result.matchedEntry ? (
                                <div className="flex items-center">
                                  <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                                  <span className="text-green-600">分類完了</span>
                                </div>
                              ) : (
                                <div className="flex items-center">
                                  <AlertTriangle className="w-4 h-4 text-red-500 mr-2" />
                                  <span className="text-red-600">要手動分類</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Scope3DictionaryPOC;
