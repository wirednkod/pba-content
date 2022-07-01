export default class WidgetImage extends HTMLElement {
  static get observerdAttributes() {
    return ['src', 'fullscreen'];
  }
  get src() {
    return this.getAttribute('src') || '';
  }
  get fullscreen() {
    return this.getAttribute('fullscreen') === 'true';
  }

  static baseUrl = ''

  connectedCallback() {
    this.render();
    console.log('WidgetImage', WidgetImage.baseUrl)
  }

  render() {
    if (this.src) {
      const $img = document.createElement('img');
      if (this.baseUrl) {
        $img.src = `${this.baseUrl}/${this.src}`;
      } else {
        $img.src = this.src;
      }
      this.append($img);
    }
  }
}
