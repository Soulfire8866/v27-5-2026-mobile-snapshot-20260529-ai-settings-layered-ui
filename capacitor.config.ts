import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nguyenthaidung.noveltranslator', // Package ID chuẩn xác của anh
  appName: 'Novel Translator',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#f4f1ea',
      style: 'LIGHT',
    },
  },
  server: {
    androidScheme: 'https',
    hostname: 'app.local', // Domain ảo để bypass hoàn toàn CORS của Google/OpenAI
    allowNavigation: [
      'generativelanguage.googleapis.com',
      'api.openai.com',
      'api.deepseek.com'
    ]
  }
};

export default config;