import { AbstractView } from "../../common/view";

export class MainView extends AbstractView {
    constructor() {
        super()
        this.setTitle('Главная страница')
    }

    render() {
        const main = document.createElement('div')
        main.innerHTML = 'Тест'
        this.app.innerHTML = ''
        this.app.append(main)
    }
}